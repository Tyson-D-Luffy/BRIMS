import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = initializeApp({
  projectId: firebaseConfig.projectId,
});

const adminDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    console.log(`Testing Firestore Admin WRITE for project: ${firebaseConfig.projectId}...`);
    await adminDb.collection("health").doc("test-write-final").set({ 
      timestamp: new Date().toISOString() 
    });
    console.log("Write successful!");
    
    const doc = await adminDb.collection("health").doc("test-write-final").get();
    console.log("Read successful! Data:", doc.data());
  } catch (error) {
    console.error("Firestore Admin Test Failed:", error);
  }
}

test();
