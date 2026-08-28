import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbId = firebaseConfig.firestoreDatabaseId === "(default)" ? undefined : firebaseConfig.firestoreDatabaseId;
const db = getFirestore(app, dbId);

async function verify() {
  await signInAnonymously(auth);
  console.log("Connected to Firestore database:", dbId || "(default)");
  
  const collections = [
    "permissions",
    "roles",
    "departments",
    "designationMaster",
    "users",
    "product_masters",
    "batch_sheet_masters",
    "batch_number_masters",
    "batch_number_formats",
    "production_batches",
    "audit_logs"
  ];

  for (const c of collections) {
    const snap = await getDocs(collection(db, c));
    console.log(`📊 Collection [${c}]: ${snap.size} documents`);
  }
}

verify().catch(console.error);
