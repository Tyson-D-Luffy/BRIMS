import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

console.log("Using Project ID:", firebaseConfig.projectId);

const app = admin.initializeApp({
  projectId: "850152913743",
});

async function test() {
  try {
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    
    console.log("Testing Firestore with databaseId:", firebaseConfig.firestoreDatabaseId);
    
    // Attempting a simple read
    const collections = await db.listCollections();
    console.log("Collections:", collections.map(c => c.id));
  } catch (error: any) {
    console.error("Firestore Admin Test Failed:", error.message);
    if (error.code) console.error("Error Code:", error.code);
  }
}

test();
