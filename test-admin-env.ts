import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = admin.initializeApp(); // Use environment default

const adminDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    console.log(`Testing Firestore Admin access with ENV DEFAULT project...`);
    const collections = await adminDb.listCollections();
    console.log("Collections found:", collections.map(c => c.id));
  } catch (error) {
    console.error("Firestore Admin Test Failed (Env Default):", error);
  }
}

test();
