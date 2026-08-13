import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: firebaseConfig.projectId,
});

const adminDb = getFirestore(app, "brims-v1");

async function test() {
  try {
    console.log(`Testing Firestore Admin access for project: ${firebaseConfig.projectId}...`);
    console.log(`Database ID: ${firebaseConfig.firestoreDatabaseId}`);
    
    console.log("Attempting to write to /test/production...");
    await adminDb.collection("test").doc("production").set({ timestamp: new Date().toISOString(), message: "Production Test" });
    console.log("Write successful!");

    const doc = await adminDb.collection("test").doc("production").get();
    console.log("Read successful! Data:", doc.data());
  } catch (error) {
    console.error("Firestore Admin Test Failed:", error);
  }
}

test();
