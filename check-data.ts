import { db, ensureAuth } from "./src/backend/config/firebase-client.ts";
import { collection, getDocs, query, where } from "firebase/firestore";

async function checkData() {
  await ensureAuth();
  
  console.log("=== BATCH SHEET MASTERS ===");
  const mastersSnap = await getDocs(collection(db, "batch_sheet_masters"));
  console.log(`Total Masters: ${mastersSnap.size}`);
  mastersSnap.forEach(d => {
    const data = d.data();
    console.log(`- ID: ${d.id}, Name: ${data.masterName}, Product: ${data.productId}, Status: ${data.status}, Branch: ${data.branch}, Deleted: ${data.isDeleted}`);
  });

  console.log("\n=== BATCH SHEET RECORDS ===");
  const recordsSnap = await getDocs(collection(db, "batch_sheet_records"));
  console.log(`Total Records: ${recordsSnap.size}`);
  recordsSnap.forEach(d => {
    const data = d.data();
    console.log(`- ID: ${d.id}, MasterId: ${data.masterId}, Status: ${data.status}, Branch: ${data.branch}`);
  });

  console.log("\n=== PRODUCTION BATCHES ===");
  const batchesSnap = await getDocs(collection(db, "production_batches"));
  console.log(`Total Batches: ${batchesSnap.size}`);
  batchesSnap.forEach(d => {
    const data = d.data();
    console.log(`- ID: ${d.id}, BatchNum: ${data.batchNumber}, RecordId: ${data.recordId}, Status: ${data.status}, Branch: ${data.branch}, FullData: ${JSON.stringify(data)}`);
  });
}

checkData().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
