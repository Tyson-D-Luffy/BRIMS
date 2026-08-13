import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbId = firebaseConfig.firestoreDatabaseId === "(default)" ? undefined : firebaseConfig.firestoreDatabaseId;
const db = getFirestore(app, dbId);

async function test() {
  try {
    await signInAnonymously(auth);
    const snap = await getDocs(collection(db, "batch_number_masters"));
    console.log(`Total masters: ${snap.size}`);
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      console.log(`Master: "${data.name}" (${data.code})`);
      console.log(`  Type: "${data.type}"`);
      console.log(`  ProductId: "${data.productId}"`);
      console.log(`  Product: "${data.product}"`);
      console.log(`  ProductName: "${data.productName}"`);
      console.log(`  Status: "${data.status}"\n`);
    });
  } catch (error: any) {
    console.error("Error:", error.message);
  }
  process.exit(0);
}

test();
