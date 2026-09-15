import { adminDb } from "../config/firebase-admin.ts";

const PERMISSIONS = [
  { id: "user:create", name: "Create User", description: "Allow creating new users" },
  { id: "user:view", name: "View Users", description: "Allow viewing user list and details" },
  { id: "user:edit", name: "Edit User", description: "Allow editing existing users" },
  { id: "user:delete", name: "Delete User", description: "Allow soft-deleting users" },
  { id: "batch:create", name: "Create Batch", description: "Allow issuing new batch records" },
  { id: "batch:view", name: "View Batch", description: "Allow viewing batch records" },
  { id: "batch:edit", name: "Edit Batch", description: "Allow editing batch data" },
  { id: "batch:sign", name: "Sign Batch", description: "Allow electronic signatures on batches" },
  { id: "batch:approve", name: "Approve Batch", description: "Allow QA approval/rejection of batches" },
  { id: "audit:view", name: "View Audit Trail", description: "Allow viewing system audit logs" },
  { id: "product:reject", name: "Reject Product Master", description: "Allow rejecting product master drafts" },
  { id: "product:return", name: "Return Product Master", description: "Allow returning product master drafts for correction" },
  { id: "product:deactivate", name: "Deactivate Product Master", description: "Allow deactivating active product masters" },
  { id: "batch_sheet_master:create", name: "Create Batch Sheet Master", description: "Allow creating batch sheet master drafts" },
  { id: "batch_sheet_master:edit", name: "Edit Batch Sheet Master", description: "Allow editing batch sheet master drafts" },
  { id: "batch_sheet_master:submit", name: "Submit Batch Sheet Master", description: "Allow submitting batch sheet master for review" },
  { id: "batch_sheet_master:review", name: "Review Batch Sheet Master", description: "Allow reviewing batch sheet master drafts" },
  { id: "batch_sheet_master:approve", name: "Approve Batch Sheet Master", description: "Allow approving batch sheet master drafts" },
  { id: "batch_sheet_master:reject", name: "Reject Batch Sheet Master", description: "Allow rejecting batch sheet master drafts" },
  { id: "batch_sheet_master:return", name: "Return Batch Sheet Master", description: "Allow returning batch sheet master drafts" },
  { id: "batch_sheet_master:deactivate", name: "Deactivate Batch Sheet Master", description: "Allow deactivating active batch sheet masters" }
];

const ROLES = [
  {
    id: "ADMIN",
    name: "IT ADMIN",
    description: "Full system administration and user management",
    permissions: PERMISSIONS.map(p => p.id)
  },
  {
    id: "QA_CHEMIST",
    name: "QA Chemist",
    description: "Authoring and drafting Product Masters, Batch Sheet Masters, and full QA Batch Issuance",
    permissions: [
      "create:product",
      "edit:product",
      "product:submit",
      "batch_sheet_master:create",
      "batch_sheet_master:edit",
      "batch_sheet_master:submit",
      "batch:view",
      "batch:review",
      "batch:approve",
      "batch:issue",
      "batch:print",
      "batch:preview",
      "op:issued",
      "op:ready_for_handover",
      "op:completed",
      "op:return_for_correction",
      "lookup:create",
      "lookup:submit",
      "batch_number:create",
      "batch_number:submit",
      "format:create",
      "format:edit",
      "format:submit",
      "department:create",
      "department:submit",
      "designation:create",
      "designation:submit",
      "audit:view"
    ]
  },
  {
    id: "QA_INCHARGE",
    name: "QA Incharge",
    description: "Review and return authority across Product Masters, Batch Sheet Masters, Lookup maintenance, and full QA Batch Issuance",
    permissions: [
      "create:product",
      "edit:product",
      "product:review",
      "product:return",
      "batch_sheet_master:create",
      "batch_sheet_master:edit",
      "batch_sheet_master:review",
      "batch_sheet_master:return",
      "batch:view",
      "batch:review",
      "batch:approve",
      "batch:issue",
      "batch:print",
      "batch:preview",
      "op:issued",
      "op:ready_for_handover",
      "op:completed",
      "op:return_for_correction",
      "lookup:edit",
      "lookup:submit",
      "batch_number:create",
      "batch_number:submit",
      "format:create",
      "format:edit",
      "format:submit",
      "department:create",
      "department:submit",
      "designation:create",
      "designation:submit",
      "audit:view"
    ]
  },
  {
    id: "QA_MANAGER",
    name: "QA Manager",
    description: "Highest approval, rejection, deactivation, and certification authority across Product Masters, Batch Sheet Masters, Lookups, and Organization Masters",
    permissions: [
      "product:approve",
      "product:reject",
      "product:return",
      "product:deactivate",
      "batch_sheet_master:approve",
      "batch_sheet_master:reject",
      "batch_sheet_master:return",
      "batch_sheet_master:deactivate",
      "batch:view",
      "batch:review",
      "batch:approve",
      "batch:issue",
      "batch:print",
      "batch:preview",
      "op:issued",
      "op:ready_for_handover",
      "op:completed",
      "op:return_for_correction",
      "lookup:approve",
      "lookup:activate",
      "lookup:deactivate",
      "batch_number:approve",
      "format:approve",
      "department:approve",
      "designation:approve",
      "audit:view"
    ]
  },
  {
    id: "PRODUCTION_INCHARGE",
    name: "Production Incharge",
    description: "Operational line execution authority: Batch creation, shopfloor custody receipt, and submission back for QA review",
    permissions: [
      "batch:create",
      "batch:view",
      "batch:preview",
      "op:production_in_progress",
      "op:ready_for_qa_review",
      "audit:view"
    ]
  }
];

const PRODUCTS = [
  {
    id: "prod-001",
    title: "Paracetamol 500mg Manufacturing SOP",
    type: "SOP",
    stage: "Production",
    documentNumber: "SOP-PARA-500",
    documentVersion: "1.0",
    documentUrl: "https://example.com/docs/sop-para-500.pdf",
    effectiveDate: "2024-01-01",
    batchNumberSeries: "B-PARA-2024-XXX",
    startPage: 1,
    endPage: 15,
    description: "Standard manufacturing procedure for Paracetamol 500mg tablets",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "prod-002",
    title: "Amoxicillin 250mg Capsule Protocol",
    type: "Protocol",
    stage: "Production",
    documentNumber: "PRO-AMOX-250",
    documentVersion: "1.2",
    documentUrl: "https://example.com/docs/pro-amox-250.pdf",
    effectiveDate: "2024-02-15",
    batchNumberSeries: "B-AMOX-2024-XXX",
    startPage: 1,
    endPage: 12,
    description: "Broad-spectrum antibiotic encapsulation protocol",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "prod-003",
    title: "Cough Relief Syrup Formulation",
    type: "Formulation",
    stage: "R&D",
    documentNumber: "FOR-COUGH-SYP",
    documentVersion: "2.0",
    documentUrl: "https://example.com/docs/for-cough-syp.pdf",
    effectiveDate: "2024-03-10",
    batchNumberSeries: "B-COUGH-2024-XXX",
    startPage: 1,
    endPage: 8,
    description: "Expectorant formulation for cough relief syrup",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const USERS = [
  {
    uid: "qa-user-id",
    email: "qa@brims.com",
    role: "QA",
    displayName: "Quality Manager",
    status: "active",
    createdAt: new Date().toISOString()
  }
];

const TEMPLATES = [
  {
    id: "temp-001",
    productId: "prod-001",
    templateName: "PARA-500-STD-V1",
    version: "1.0",
    status: "APPROVED",
    steps_json: [
      { step_number: 1, description: "Dispense raw materials", equipment: "Dispensing Booth", expected_time: "2 hours" },
      { step_number: 2, description: "Granulation process", equipment: "High Shear Mixer", expected_time: "4 hours" },
      { step_number: 3, description: "Compression into tablets", equipment: "Tablet Press", expected_time: "6 hours" }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false
  },
  {
    id: "temp-002",
    productId: "prod-001",
    templateName: "PARA-500-EXP-V1",
    version: "1.1",
    status: "DRAFT",
    steps_json: [
      { step_number: 1, description: "Experimental mixing", equipment: "Lab Mixer", expected_time: "1 hour" }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false
  },
  {
    id: "temp-003",
    productId: "prod-002",
    templateName: "AMOX-250-CAP-V1",
    version: "1.0",
    status: "APPROVED",
    steps_json: [
      { step_number: 1, description: "Capsule filling", equipment: "Encapsulation Machine", expected_time: "8 hours" }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false
  }
];

async function seed() {
  console.log("🚀 Starting seed process (Admin SDK)...");

  try {
    // 1. Seed Permissions
    console.log("📦 Seeding permissions...");
    for (const p of PERMISSIONS) {
      await adminDb.collection("permissions").doc(p.id).set(p);
    }

    // 2. Dynamic designations are used instead of hardcoded roles.
    console.log("👥 Skipping hardcoded roles seeding...");

    // 3. Seed Users
    console.log("👤 Seeding users...");
    for (const u of USERS) {
      await adminDb.collection("users").doc(u.uid).set(u);
    }

    // 4. Seed Products
    console.log("💊 Seeding products...");
    for (const p of PRODUCTS) {
      const { id, ...data } = p;
      await adminDb.collection("products").doc(id).set(data);
    }

    // 5. Seed Templates
    console.log("📄 Seeding templates...");
    for (const t of TEMPLATES) {
      const { id, ...data } = t;
      await adminDb.collection("batch_record_templates").doc(id).set(data);
    }

    console.log("✨ Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();
