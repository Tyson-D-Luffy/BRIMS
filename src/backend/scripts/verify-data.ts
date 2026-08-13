import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, limit } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));

async function test() {
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);
  
  try {
    const q = query(collection(db, "products"), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      console.log(`✅ Successfully read from ${config.firestoreDatabaseId}. Data exists.`);
      snapshot.forEach(doc => console.log(doc.id, doc.data()));
    } else {
      console.log(`⚠️ Database ${config.firestoreDatabaseId} is empty.`);
    }
  } catch (error) {
    console.error(`❌ Failed to read from ${config.firestoreDatabaseId}:`, error.message);
  }
}

test();
