import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

const adminDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    console.log(`Testing Firestore Admin access for project: 813258841581...`);
    const collections = await adminDb.listCollections();
    console.log("Collections found:", collections.map(c => c.id));
  } catch (error) {
    console.error("Firestore Admin Test Failed:", error);
  }
}

test();
