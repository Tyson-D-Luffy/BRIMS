import { BatchSheetMasterService } from "./src/backend/services/batchSheetMaster.service.ts";

async function testDraft() {
  const user = { uid: "test-uid", email: "shakshay04@gmail.com" };
  const payload = {
    productId: "JDFhfv4dNX3x8XTftbee", // Dapagliflozin (exists in DB)
    masterName: "Simulation Test Master",
    title: "Simulation Test Master",
    stage: "Manufacturing",
    type: "Drying",
    batchNumberSeries: "SIM-2026-XXX",
    documentNumber: "DOC-SIM-123",
    version: "1.0",
    files: [],
    branch: "Masulkhana"
  };

  try {
    console.log("Attempting to create master...");
    const res = await BatchSheetMasterService.createMaster(payload, user);
    console.log("Success! Created master ID:", res.id);
  } catch (error: any) {
    console.error("FAILED to create master:", error.message);
  }
}

testDraft().then(() => process.exit(0));
