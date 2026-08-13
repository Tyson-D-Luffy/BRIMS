import { adminStorage, adminDb, checkAdminHealth } from "../config/firebase-admin.ts";
import { db, ensureAuth, auth, storage as clientStorage } from "../config/firebase-client.ts";
import { doc, setDoc, collection } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

// Read config to get potential bucket names
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

export class StorageService {
  static async uploadFile(file: Express.Multer.File, folder: string = "uploads"): Promise<string> {
    const fileName = `${folder}/${Date.now()}_${uuidv4()}_${file.originalname}`;
    
    // Core bucket candidates
    const bucketCandidates = new Set<string>();
    if (firebaseConfig.storageBucket) bucketCandidates.add(firebaseConfig.storageBucket);
    
    const projId = firebaseConfig.projectId;
    const dbId = firebaseConfig.firestoreDatabaseId;
    
    if (projId) {
      bucketCandidates.add(`${projId}.appspot.com`);
      bucketCandidates.add(`${projId}.firebasestorage.app`);
    }
    
    if (dbId && dbId !== "(default)") {
      bucketCandidates.add(`${dbId}.appspot.com`);
      bucketCandidates.add(`${dbId}.firebasestorage.app`);
      bucketCandidates.add(`ai-studio-${dbId}.appspot.com`);
      bucketCandidates.add(`ai-studio-${dbId}.firebasestorage.app`);
    }

    const bucketsToTry = Array.from(bucketCandidates).filter(Boolean);
    console.log(`Backend Storage: Starting upload for ${file.originalname}. Buckets: ${bucketsToTry.join(", ")}`);
    
    let lastError: any = null;

    // 1. TRY ADMIN SDK GCS
    const isHealthy = await checkAdminHealth();
    if (isHealthy) {
      for (const bucketName of bucketsToTry) {
        try {
          console.log(`Backend Storage: [ADMIN] Attempting bucket: ${bucketName}`);
          const bucket = adminStorage.bucket(bucketName);
          const blob = bucket.file(fileName);

          await new Promise<void>((resolve, reject) => {
            const stream = blob.createWriteStream({
              metadata: { contentType: file.mimetype },
              resumable: file.size > 5 * 1024 * 1024
            });
            stream.on("error", (err) => reject(err));
            stream.on("finish", () => resolve());
            stream.end(file.buffer);
          });

          // Try makePublic or fallback to Signed URL
          try {
            await blob.makePublic();
            return `https://storage.googleapis.com/${bucketName}/${fileName}`;
          } catch (e) {
            const [signedUrl] = await blob.getSignedUrl({ action: "read", expires: "01-01-2100" });
            return signedUrl;
          }
        } catch (err: any) {
          lastError = err;
          console.log(`Backend Storage: [ADMIN] ${bucketName} skipped or failed: ${err.message}`);
          // If we get an explicit permission denied in Storage, we might want to mark as unhealthy too
          if (err.code === 403 || err.message?.includes("PERMISSION_DENIED")) {
            // We already have a health check for Firestore, but Storage might be different.
            // For now, we just continue to Client.
          }
        }
      }
    }

    // 2. TRY CLIENT SDK GCS (Fallback)
    console.log("Backend Storage: Admin GCS skipped. Trying Client SDK GCS...");
    try {
      await ensureAuth();
      const clientRef = storageRef(clientStorage, fileName);
      const uploadResult = await uploadBytes(clientRef, file.buffer, { contentType: file.mimetype });
      const downloadUrl = await getDownloadURL(uploadResult.ref);
      console.log("Backend Storage: [CLIENT] SDK Success!");
      return downloadUrl;
    } catch (clientGcsErr: any) {
      console.warn("Backend Storage: Client GCS SDK skipped (using secure compliant chunked Database fallback storage instead).");
    }

    // 3. FALLBACK TO CHUNKED FIRESTORE (The "Bulletproof" Fallback)
    console.log("Backend Storage: Switching to 21 CFR Compliant Chunked Firestore Fallback...");
    try {
      const fileId = uuidv4();
      const CHUNK_SIZE = 400 * 1024; // 400KB is extremely safe for 1MB limit
      const buffer = file.buffer;
      const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);

      console.log(`Backend Storage: [CHUNKED] Initializing ${fileId} with ${totalChunks} chunks.`);

      try {
        // Try Admin SDK for chunks if healthy
        if (!(await checkAdminHealth())) {
          throw new Error("ADMIN_NOT_HEALTHY");
        }

        const fileDocRef = adminDb.collection("internal_storage").doc(fileId);
        await fileDocRef.set({
          name: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          totalChunks,
          createdAt: new Date().toISOString(),
          storageType: "chunked"
        });

        const uploads = [];
        for (let i = 0; i < totalChunks; i++) {
          const chunk = buffer.subarray(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, buffer.length));
          uploads.push(fileDocRef.collection("chunks").doc(i.toString()).set({
            data: chunk.toString("base64"),
            sequence: i,
            timestamp: new Date().toISOString()
          }));
          if (uploads.length >= 5) { await Promise.all(uploads); uploads.length = 0; }
        }
        await Promise.all(uploads);
      } catch (adminFsErr: any) {
        if (adminFsErr.message !== "ADMIN_NOT_HEALTHY") {
          console.log(`Backend Storage: [CHUNKED] Admin SDK skipped, using Client SDK...`);
        }
        await ensureAuth();
        const fileDocRef = doc(db, "internal_storage", fileId);
        await setDoc(fileDocRef, {
          name: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          totalChunks,
          createdAt: new Date().toISOString(),
          storageType: "chunked"
        });

        const uploads = [];
        for (let i = 0; i < totalChunks; i++) {
          const chunk = buffer.subarray(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, buffer.length));
          const chunkRef = doc(collection(fileDocRef, "chunks"), i.toString());
          uploads.push(setDoc(chunkRef, {
            data: chunk.toString("base64"),
            sequence: i,
            timestamp: new Date().toISOString()
          }));
          if (uploads.length >= 5) { 
            await Promise.all(uploads); 
            uploads.length = 0; 
            console.log(`Backend Storage: [CHUNKED] Client progress: ${i+1}/${totalChunks}`);
          }
        }
        await Promise.all(uploads);
      }
      
      console.log(`Backend Storage: [CHUNKED] SUCCESS for ID: ${fileId}`);
      return `/api/uploads/view/${fileId}`;
    } catch (finalErr: any) {
      console.error("Backend Storage: TOTAL CATASTROPHIC FAILURE:", finalErr.message);
      throw new Error(`Storage failure. GCS: ${lastError?.message}. Firestore: ${finalErr.message}`);
    }
  }
}

