import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));

async function test() {
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);
  
  try {
    await setDoc(doc(collection(db, "health"), "test-client"), { time: new Date().toISOString() });
    console.log(`✅ Successfully wrote to ${config.firestoreDatabaseId} via Client SDK`);
  } catch (error) {
    console.error(`❌ Failed to write to ${config.firestoreDatabaseId} via Client SDK:`, error.message);
  }
}

test();
