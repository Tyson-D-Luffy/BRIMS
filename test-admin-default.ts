import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

const adminDb = getFirestore(app); // Use default database

async function test() {
  try {
    console.log(`Testing Firestore Admin access for DEFAULT database...`);
    const collections = await adminDb.listCollections();
    console.log("Collections found:", collections.map(c => c.id));
  } catch (error) {
    console.error("Firestore Admin Test Failed (Default DB):", error);
  }
}

test();
