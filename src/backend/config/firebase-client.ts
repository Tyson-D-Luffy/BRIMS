import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, setLogLevel } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const dbId = firebaseConfig.firestoreDatabaseId === "(default)" ? undefined : firebaseConfig.firestoreDatabaseId;

// Set log level to 'error' to suppress verbose SDK diagnostic logs and BloomFilter errors
setLogLevel('error');

export const db = getFirestore(app, dbId);
export const storage = getStorage(app);

let isAuthed = false;
let authPromise: Promise<void> | null = null;

export async function ensureAuth() {
  if (isAuthed) return;
  if (authPromise) return authPromise;

  authPromise = (async () => {
    try {
      console.log("Backend Client SDK: Attempting Anonymous Auth...");
      const userCredential = await signInAnonymously(auth);
      isAuthed = true;
      console.log("Backend Client SDK: Anonymous Auth successful. UID:", userCredential.user.uid);
    } catch (error: any) {
      console.error("Backend Client SDK: Anonymous Auth failed. Code:", error.code, "Message:", error.message);
      authPromise = null; // Reset to allow retry
      // Do not re-throw, let the calling service attempt the operation.
      // If the Firestore security rules or access permissions fail, Firestore itself will throw an appropriate error.
    }
  })();

  return authPromise;
}
