import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));

async function test() {
  const app = admin.initializeApp({
    projectId: config.projectId,
  }, "test-app");

  const db = getFirestore(app, "brims-db-v1");
  
  try {
    await db.collection("health").doc("test").set({ time: new Date().toISOString() });
    console.log("✅ Successfully wrote to brims-db-v1");
  } catch (error) {
    console.error("❌ Failed to write to brims-db-v1:", error.message);
  } finally {
    await app.delete();
  }
}

test();
