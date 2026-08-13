
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

console.log("Testing with Project Number: 813258841581");

const app = admin.initializeApp({
  projectId: "813258841581",
}, "test-app-number");

const adminDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    console.log("Attempting to list collections...");
    const collections = await adminDb.listCollections();
    console.log("Collections found:", collections.map(c => c.id));
  } catch (error) {
    console.error("Test Failed:", error);
  }
}

test();
