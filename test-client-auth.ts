import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore/lite";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbId = firebaseConfig.firestoreDatabaseId === "(default)" ? undefined : firebaseConfig.firestoreDatabaseId;
const db = getFirestore(app, dbId);

async function test() {
  try {
    console.log("Testing Anonymous Auth...");
    const userCredential = await signInAnonymously(auth);
    console.log("Anonymous Auth Successful! UID:", userCredential.user.uid);
    
    console.log("Querying batch_number_formats for branch 'Masulkhana' using firestore/lite...");
    const q = query(
      collection(db, 'batch_number_formats'),
      where('branch', '==', 'Masulkhana')
    );
    const snap = await getDocs(q);
    console.log("Query Successful! Documents found:", snap.size);
    snap.docs.forEach(doc => {
      console.log("- Document ID:", doc.id, "Data:", doc.data());
    });
  } catch (error: any) {
    console.error("Firestore test failed!");
    console.error("Code:", error.code);
    console.error("Message:", error.message);
    if (error.stack) console.error(error.stack);
  }
}

test();
