import express from "express";
import multer from "multer";
import { uploadFile } from "../controllers/upload.controller.ts";
import { authenticateToken } from "../middleware/auth.middleware.ts";
import { db, ensureAuth } from "../config/firebase-client.ts";
import { adminDb, checkAdminHealth } from "../config/firebase-admin.ts";
import { doc, getDoc, collection, getDocs, query, orderBy } from "firebase/firestore";

const router = express.Router();

// Configure multer to use memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // Limit size to 50MB
  },
});

router.post("/", authenticateToken, upload.single("file"), uploadFile);

// Route to view files from internal storage fallback
router.get("/view/:id", async (req, res) => {
  const docId = req.params.id;
  try {
    console.log(`[STORAGE_VIEW]: Requested view for file ID: ${docId}`);
    
    // 1. Try Admin SDK for bypass and performance if healthy
    try {
      if (!(await checkAdminHealth())) {
        throw new Error("ADMIN_NOT_HEALTHY");
      }

      const docRef = adminDb.collection("internal_storage").doc(docId);
      const docSnap = await docRef.get();
      
      if (!docSnap.exists) {
        // If it doesn't exist even in Admin, it's a real 404
        console.warn(`[STORAGE_VIEW]: Doc ${docId} not found in Admin SDK. checking Client...`);
        throw new Error("NOT_FOUND_IN_ADMIN");
      }

      const data = docSnap.data();
      if (!data) return res.status(404).send("Invalid file data");

      let buffer: Buffer;

      // 2. Handle Chunked Storage
      if (data.storageType === "chunked") {
        const totalChunks = data.totalChunks || 0;
        console.log(`[STORAGE_VIEW]: Reassembling ${totalChunks} chunks for ${data.name}`);
        let chunkBuffers: Buffer[] = [];
        
        const chunksSnap = await docRef.collection("chunks").orderBy("sequence").get();
        const chunkMap = new Map();
        chunksSnap.docs.forEach(d => {
          chunkMap.set(d.data().sequence, Buffer.from(d.data().data, "base64"));
        });
        
        for (let i = 0; i < totalChunks; i++) {
          if (chunkMap.has(i)) chunkBuffers.push(chunkMap.get(i));
          else console.warn(`[STORAGE_VIEW]: Chunk ${i} missing for ${docId}`);
        }
        
        if (chunkBuffers.length === 0) throw new Error("EMPTY_CHUNKS");
        buffer = Buffer.concat(chunkBuffers);
      } 
      else if (data.content) {
        buffer = Buffer.from(data.content, "base64");
      } 
      else {
        return res.status(404).send("File content missing or unsupported storage type.");
      }

      res.setHeader("Content-Type", data.mimetype || "application/pdf");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(data.name || "file.pdf")}"`);
      return res.status(200).send(buffer);

    } catch (adminErr: any) {
      if (adminErr.message === "NOT_FOUND_IN_ADMIN") {
        // Just continue to Client fallback
      } else if (adminErr.message === "ADMIN_NOT_HEALTHY") {
        // Silent transition
      } else {
        console.warn(`[STORAGE_VIEW]: Admin SDK failed for ${docId} (Error: ${adminErr.message}). Falling back to Client...`);
      }
      
      // FULL FALLBACK TO CLIENT SDK
      try {
        await ensureAuth();
        const docSnap = await getDoc(doc(db, "internal_storage", docId));
        if (!docSnap.exists()) {
          console.error(`[STORAGE_VIEW]: File ${docId} not found even in Client SDK.`);
          return res.status(404).send("File not found.");
        }

        const data = docSnap.data();
        let buffer: Buffer;

        if (data.storageType === "chunked") {
          const totalChunks = data.totalChunks || 0;
          const q = query(collection(db, "internal_storage", docId, "chunks"), orderBy("sequence"));
          const chunksSnap = await getDocs(q);
          const chunkMap = new Map();
          chunksSnap.docs.forEach(d => chunkMap.set(d.data().sequence, Buffer.from(d.data().data, "base64")));
          
          let chunkBuffers: Buffer[] = [];
          for (let i = 0; i < totalChunks; i++) {
            if (chunkMap.has(i)) chunkBuffers.push(chunkMap.get(i));
          }
          if (chunkBuffers.length === 0) return res.status(404).send("No data chunks found.");
          buffer = Buffer.concat(chunkBuffers);
        } else if (data.content) {
          buffer = Buffer.from(data.content, "base64");
        } else {
          return res.status(404).send("Content missing.");
        }

        res.setHeader("Content-Type", data.mimetype || "application/pdf");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(data.name || "file.pdf")}"`);
        return res.status(200).send(buffer);
      } catch (clientErr: any) {
        console.error(`[STORAGE_VIEW]: Client SDK also failed for ${docId}:`, clientErr.message);
        return res.status(500).send(`Critical load error: ${clientErr.message}`);
      }
    }
  } catch (error: any) {
    console.error(`[STORAGE_VIEW]: Final catch-all error for ${docId}:`, error);
    res.status(500).send(`Critical error retrieving file: ${error.message}`);
  }
});

export default router;
