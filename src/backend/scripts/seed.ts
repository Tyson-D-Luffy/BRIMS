import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection } from 'firebase/firestore';
import firebaseConfig from "../../../firebase-applet-config.json" assert { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
  { id: "create:product", name: "Create Product Master", description: "Allow creating product master drafts" },
  { id: "edit:product", name: "Edit Product Master", description: "Allow editing product master drafts" },
  { id: "product:review", name: "Review Product Master", description: "Allow reviewing product master drafts" },
  { id: "product:approve", name: "Approve Product Master", description: "Allow approving product master drafts" },
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
    name: "Administrator",
    description: "Full system access and user management",
    permissions: PERMISSIONS.map(p => p.id)
  },
  {
    id: "QA",
    name: "Quality Assurance",
    description: "Quality review, approvals, and audit oversight",
    permissions: ["user:view", "batch:view", "batch:approve", "audit:view", "create:product", "edit:product", "product:review", "product:approve"]
  },
  {
    id: "PRODUCTION_MANAGER",
    name: "Production Manager",
    description: "Manage production schedules and batch issuance",
    permissions: ["user:view", "batch:create", "batch:view", "batch:edit", "batch:sign", "audit:view", "create:product", "edit:product", "product:review", "product:approve"]
  },
  {
    id: "OPERATOR",
    name: "Operator",
    description: "Execute batch operations and record data",
    permissions: ["batch:view", "batch:edit", "batch:sign"]
  },
  {
    id: "VIEWER",
    name: "Viewer",
    description: "Read-only access to batch records",
    permissions: ["batch:view"]
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
    branch: "Masulkhana",
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
    branch: "Baddi",
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
    branch: "Baddi",
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
  },
  {
    uid: "shakshay-id-holder",
    email: "shakshay04@gmail.com",
    role: "ADMIN",
    displayName: "System Administrator",
    status: "active",
    createdAt: new Date().toISOString()
  }
];

const API_KEY = firebaseConfig.apiKey;

async function getOrCreateFirebaseAuthUser(email: string): Promise<string> {
  const password = "password123";
  const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
  try {
    const response = await fetch(signUpUrl, {
      method: "POST",
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      headers: { "Content-Type": "application/json" }
    });
    const data: any = await response.json();
    if (response.ok && data.localId) {
      console.log(`   Created Auth user for ${email} -> UID: ${data.localId}`);
      return data.localId;
    }
    
    if (data.error?.message === "EMAIL_EXISTS") {
      const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
      const signInResponse = await fetch(signInUrl, {
        method: "POST",
        body: JSON.stringify({ email, password, returnSecureToken: true }),
        headers: { "Content-Type": "application/json" }
      });
      const signInData: any = await signInResponse.json();
      if (signInResponse.ok && signInData.localId) {
        console.log(`   Found existing Auth user for ${email} -> UID: ${signInData.localId}`);
        return signInData.localId;
      }
    }
    throw new Error(data.error?.message || "Failed to create/get Auth user");
  } catch (error: any) {
    console.error(`   Error handling Auth for ${email}:`, error.message);
    throw error;
  }
}

function getPermissionsForRole(role: string): string[] {
  switch (role) {
    case "ADMIN":
      return [
        "user:create", "user:view", "user:edit", "user:delete",
        "batch:create", "batch:view", "batch:edit", "batch:sign", "batch:approve",
        "audit:view", "create:product", "edit:product", "product:review", "product:approve"
      ];
    case "QA":
      return ["user:view", "batch:view", "batch:approve", "audit:view", "create:product", "edit:product", "product:review", "product:approve"];
    case "PRODUCTION_MANAGER":
      return ["user:view", "batch:create", "batch:view", "batch:edit", "batch:sign", "audit:view", "create:product", "edit:product", "product:review", "product:approve"];
    case "OPERATOR":
      return ["batch:view", "batch:edit", "batch:sign"];
    default:
      return ["batch:view"];
  }
}

async function seedUsers(db: any) {
  console.log("👤 Seeding users into Firebase Auth and Firestore...");
  for (const user of USERS) {
    try {
      const realUid = await getOrCreateFirebaseAuthUser(user.email);
      const seededUser = {
        ...user,
        uid: realUid,
        username: user.email.split("@")[0],
        employeeId: `EMP-${user.role.substring(0, 3)}-${Math.floor(100 + Math.random() * 900)}`,
        defaultBranch: "Masulkhana",
        allowedBranches: ["Masulkhana", "Baddi"],
        multiBranchAccess: true,
        permissions: getPermissionsForRole(user.role),
        status: "active",
        failedLoginAttempts: 0,
        maxLoginAttempts: 5,
        accountLockAfterFailedAttempts: true,
        passwordExpiry: "90 Days"
      };
      
      await setDoc(doc(db, "users", realUid), seededUser);
      console.log(`   ✅ User Document created: ${user.email} with UID: ${realUid}`);
      
      // Also write user under the static hardcoded uid for backwards compatibility/failsafes
      await setDoc(doc(db, "users", user.uid), seededUser);
    } catch (err: any) {
      console.warn(`   ⚠️ Warning seeding user ${user.email}: ${err.message}`);
    }
  }
}

async function seedProducts(db: any) {
  console.log("💊 Seeding product_masters...");
  for (const product of PRODUCTS) {
    const { id, ...data } = product;
    await setDoc(doc(db, "product_masters", id), data);
    console.log(`   ✅ Product Master: ${product.documentNumber}`);
  }
}

// Update the seed function to call seedProducts
async function seed() {
  console.log("🚀 Starting seed process (Client SDK)...");

  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    console.log("🔒 Logging in anonymously to authorize Firestore writes...");
    const cred = await signInAnonymously(auth);
    console.log(`🔓 Anonymous authentication successful! UID: ${cred.user.uid}`);
    
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

    // 1. Seed Permissions
    console.log("📦 Seeding permissions...");
    for (const permission of PERMISSIONS) {
      await setDoc(doc(db, "permissions", permission.id), permission);
      console.log(`   ✅ Permission: ${permission.id}`);
    }

    // 2. Dynamic designations are used instead of hardcoded roles.
    console.log("👥 Skipping hardcoded roles seeding...");

    // 3. Seed Users
    await seedUsers(db);

    // 4. Seed Products
    await seedProducts(db);

    // 5. Seed Templates
    await seedTemplates(db);

    console.log("✨ Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

const TEMPLATES = [
  {
    id: "temp-001",
    productId: "prod-001", // Paracetamol
    templateName: "PARA-500-STD-V1",
    version: "1.0",
    status: "APPROVED",
    branch: "Masulkhana",
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
    productId: "prod-001", // Paracetamol
    templateName: "PARA-500-EXP-V1",
    version: "1.1",
    status: "DRAFT",
    branch: "Masulkhana",
    steps_json: [
      { step_number: 1, description: "Experimental mixing", equipment: "Lab Mixer", expected_time: "1 hour" }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false
  },
  {
    id: "temp-003",
    productId: "prod-002", // Amoxicillin
    templateName: "AMOX-250-CAP-V1",
    version: "1.0",
    status: "APPROVED",
    branch: "Baddi",
    steps_json: [
      { step_number: 1, description: "Capsule filling", equipment: "Encapsulation Machine", expected_time: "8 hours" }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false
  }
];

async function seedTemplates(db: any) {
  console.log("📄 Seeding templates to batch_sheet_masters...");
  for (const template of TEMPLATES) {
    const { id, templateName, ...rest } = template;
    const documentData = {
      ...rest,
      masterName: templateName,
      isLocked: false,
      createdBy: "admin-user",
      recordCount: 0
    };
    await setDoc(doc(db, "batch_sheet_masters", id), documentData);
    console.log(`   ✅ Template: ${templateName} -> batch_sheet_masters`);
  }
}

seed();
