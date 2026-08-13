import { db, ensureAuth } from "./src/backend/config/firebase-client.ts";
import { collection, getDocs } from "firebase/firestore";

async function listProducts() {
  await ensureAuth();
  const snap = await getDocs(collection(db, "product_masters"));
  console.log(`Total Products: ${snap.size}`);
  snap.forEach(d => {
    const data = d.data();
    console.log(`- ID: ${d.id}, Title: ${data.title}, Status: ${data.status}, Branch: ${data.branch}`);
  });
}

listProducts().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
