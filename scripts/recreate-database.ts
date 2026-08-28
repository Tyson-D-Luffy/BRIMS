import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, collection } from "firebase/firestore";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbId = firebaseConfig.firestoreDatabaseId === "(default)" ? undefined : firebaseConfig.firestoreDatabaseId;
const db = getFirestore(app, dbId);
const API_KEY = firebaseConfig.apiKey;

// ==========================================
// 1. PERMISSIONS
// ==========================================
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
  { id: "batch:print", name: "Print Batch Record", description: "Allow official print/reprint of batch records" },
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
  { id: "batch_sheet_master:deactivate", name: "Deactivate Batch Sheet Master", description: "Allow deactivating active batch sheet masters" },
  { id: "lookup:create", name: "Create Master Lookup", description: "Allow creating lookup values (Stage, Recovery, Generic, Process, Base Batch)" },
  { id: "lookup:edit", name: "Edit Master Lookup", description: "Allow editing lookup values" },
  { id: "lookup:submit", name: "Submit Master Lookup", description: "Allow submitting lookup values for review" },
  { id: "lookup:approve", name: "Approve Master Lookup", description: "Allow approving lookup values" },
  { id: "lookup:activate", name: "Activate Master Lookup", description: "Allow activating approved lookup values" },
  { id: "lookup:deactivate", name: "Deactivate Master Lookup", description: "Allow deactivating lookup values" },
  { id: "op:issued", name: "Official Batch Issuance", description: "Allow transitioning batch request to ISSUED" },
  { id: "op:ready_for_handover", name: "Prepare Custody Handover", description: "Allow transitioning batch to READY_FOR_PRODUCTION_HANDOVER" },
  { id: "op:production_in_progress", name: "Receive Production Custody", description: "Allow receiving batch in production (PRODUCTION_IN_PROGRESS)" },
  { id: "op:ready_for_qa_review", name: "Submit for QA Review", description: "Allow sending batch back for QA review" },
  { id: "op:completed", name: "QA Received / Complete", description: "Allow QA final receipt and completion (COMPLETED)" },
  { id: "op:return_for_correction", name: "Return for Correction", description: "Allow QA returning batch for correction" },
  { id: "batch_number_format:view", name: "View Batch Formats", description: "Allow viewing batch number format builder" },
  { id: "batch_number_format:edit", name: "Edit Batch Formats", description: "Allow configuring batch number format rules" }
];

// ==========================================
// 2. ROLES
// ==========================================
const ROLES = [
  {
    id: "ADMIN",
    name: "Administrator",
    description: "Full system access, branch configuration, and user management",
    permissions: PERMISSIONS.map(p => p.id)
  },
  {
    id: "QA",
    name: "Quality Assurance",
    description: "Quality review, approvals, and audit oversight",
    permissions: [
      "user:view", "batch:view", "batch:approve", "batch:print", "audit:view",
      "create:product", "edit:product", "product:review", "product:approve", "product:reject", "product:return", "product:deactivate",
      "batch_sheet_master:create", "batch_sheet_master:edit", "batch_sheet_master:submit", "batch_sheet_master:review", "batch_sheet_master:approve", "batch_sheet_master:reject", "batch_sheet_master:return", "batch_sheet_master:deactivate",
      "lookup:create", "lookup:edit", "lookup:submit", "lookup:approve", "lookup:activate", "lookup:deactivate",
      "op:issued", "op:ready_for_handover", "op:completed", "op:return_for_correction",
      "batch_number_format:view", "batch_number_format:edit"
    ]
  },
  {
    id: "PRODUCTION_MANAGER",
    name: "Production Manager",
    description: "Manage production schedules, batch issuance requests, and execution",
    permissions: [
      "user:view", "batch:create", "batch:view", "batch:edit", "batch:sign", "audit:view",
      "create:product", "edit:product",
      "batch_sheet_master:create", "batch_sheet_master:edit", "batch_sheet_master:submit",
      "lookup:create", "lookup:submit",
      "op:production_in_progress", "op:ready_for_qa_review",
      "batch_number_format:view"
    ]
  },
  {
    id: "OPERATOR",
    name: "Operator",
    description: "Execute batch operations and record step parameters",
    permissions: ["batch:view", "batch:edit", "batch:sign"]
  },
  {
    id: "VIEWER",
    name: "Viewer",
    description: "Read-only access to batch records and dashboards",
    permissions: ["batch:view", "user:view"]
  }
];

// ==========================================
// 3. DEPARTMENTS
// ==========================================
const DEPARTMENTS = [
  {
    id: "DEP-001",
    departmentCode: "DEP-001",
    departmentName: "Production",
    description: "Formulation, manufacturing, and packaging shopfloor operations",
    branch: "Masulkhana",
    branchType: "Multi",
    allowedBranches: ["Masulkhana", "Baddi"],
    status: "Active",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "DEP-002",
    departmentCode: "DEP-002",
    departmentName: "Quality Assurance",
    description: "Compliance oversight, batch release, and 21 CFR Part 11 validation",
    branch: "Masulkhana",
    branchType: "Multi",
    allowedBranches: ["Masulkhana", "Baddi"],
    status: "Active",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "DEP-003",
    departmentCode: "DEP-003",
    departmentName: "Quality Control",
    description: "Analytical testing, raw material assays, and finished goods testing",
    branch: "Masulkhana",
    branchType: "Multi",
    allowedBranches: ["Masulkhana", "Baddi"],
    status: "Active",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "DEP-004",
    departmentCode: "DEP-004",
    departmentName: "Research & Development",
    description: "New formulation development, process scaling, and pilot testing",
    branch: "Baddi",
    branchType: "Multi",
    allowedBranches: ["Masulkhana", "Baddi"],
    status: "Active",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "DEP-005",
    departmentCode: "DEP-005",
    departmentName: "Warehouse & Supply",
    description: "Raw material dispensing, staging, inventory control, and finished goods dispatch",
    branch: "Masulkhana",
    branchType: "Multi",
    allowedBranches: ["Masulkhana", "Baddi"],
    status: "Active",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "DEP-006",
    departmentCode: "DEP-006",
    departmentName: "Engineering & Maintenance",
    description: "Equipment calibration, HVAC cleanroom validation, and preventive maintenance",
    branch: "Masulkhana",
    branchType: "Multi",
    allowedBranches: ["Masulkhana", "Baddi"],
    status: "Active",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// ==========================================
// 4. DESIGNATIONS
// ==========================================
const DESIGNATIONS = [
  {
    id: "DES-001",
    designationCode: "DES-001",
    designationName: "System Administrator",
    description: "Full system administration, branch configuration, and security settings",
    departmentId: "DEP-002",
    departmentName: "Quality Assurance",
    baseRole: "ADMIN",
    branch: "Masulkhana",
    branchType: "Multi",
    allowedBranches: ["Masulkhana", "Baddi"],
    status: "Active",
    version: 1,
    granularPermissions: PERMISSIONS.map(p => p.id),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "DES-002",
    designationCode: "DES-002",
    designationName: "QA Head / Manager",
    description: "QA review, batch sheet master approval, batch issuance, and QA receipt",
    departmentId: "DEP-002",
    departmentName: "Quality Assurance",
    baseRole: "QA",
    branch: "Masulkhana",
    branchType: "Multi",
    allowedBranches: ["Masulkhana", "Baddi"],
    status: "Active",
    version: 1,
    granularPermissions: ROLES.find(r => r.id === "QA")?.permissions || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "DES-003",
    designationCode: "DES-003",
    designationName: "Production Manager",
    description: "Production planning, batch record initiation, execution oversight",
    departmentId: "DEP-001",
    departmentName: "Production",
    baseRole: "PRODUCTION_MANAGER",
    branch: "Masulkhana",
    branchType: "Multi",
    allowedBranches: ["Masulkhana", "Baddi"],
    status: "Active",
    version: 1,
    granularPermissions: ROLES.find(r => r.id === "PRODUCTION_MANAGER")?.permissions || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "DES-004",
    designationCode: "DES-004",
    designationName: "Shopfloor Operator",
    description: "Line execution, parameter data entry, and step e-signatures",
    departmentId: "DEP-001",
    departmentName: "Production",
    baseRole: "OPERATOR",
    branch: "Masulkhana",
    branchType: "Multi",
    allowedBranches: ["Masulkhana", "Baddi"],
    status: "Active",
    version: 1,
    granularPermissions: ["batch:view", "batch:edit", "batch:sign"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// ==========================================
// 5. PRODUCTS
// ==========================================
const PRODUCTS = [
  {
    id: "prod-001",
    title: "Paracetamol 500mg Tablets",
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
    workflowStatus: "Approved",
    branch: "Masulkhana",
    genericName: "Paracetamol",
    dosageForm: "Tablet",
    strength: "500mg",
    shelfLifeMonths: 36,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "prod-002",
    title: "Amoxicillin 250mg Capsules",
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
    workflowStatus: "Approved",
    branch: "Baddi",
    genericName: "Amoxicillin Trihydrate",
    dosageForm: "Capsule",
    strength: "250mg",
    shelfLifeMonths: 24,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "prod-003",
    title: "Cough Relief Syrup 100ml",
    type: "Formulation",
    stage: "R&D",
    documentNumber: "FOR-COUGH-SYP",
    documentVersion: "2.0",
    documentUrl: "https://example.com/docs/for-cough-syp.pdf",
    effectiveDate: "2024-03-10",
    batchNumberSeries: "B-COUGH-2024-XXX",
    startPage: 1,
    endPage: 8,
    description: "Expectorant formulation for pediatric and adult cough relief syrup",
    status: "active",
    workflowStatus: "Approved",
    branch: "Masulkhana",
    genericName: "Dextromethorphan + Guaifenesin",
    dosageForm: "Syrup",
    strength: "10mg/5ml",
    shelfLifeMonths: 24,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "prod-004",
    title: "Metformin Hydrochloride 500mg Tablets",
    type: "SOP",
    stage: "Production",
    documentNumber: "SOP-MET-500",
    documentVersion: "1.0",
    documentUrl: "https://example.com/docs/sop-met-500.pdf",
    effectiveDate: "2024-04-01",
    batchNumberSeries: "B-MET-2024-XXX",
    startPage: 1,
    endPage: 14,
    description: "Standard manufacturing procedure for Metformin HCl antidiabetic tablets",
    status: "active",
    workflowStatus: "Approved",
    branch: "Baddi",
    genericName: "Metformin Hydrochloride",
    dosageForm: "Tablet",
    strength: "500mg",
    shelfLifeMonths: 36,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "prod-005",
    title: "Ibuprofen 400mg Film-Coated Tablets",
    type: "SOP",
    stage: "Production",
    documentNumber: "SOP-IBU-400",
    documentVersion: "1.1",
    documentUrl: "https://example.com/docs/sop-ibu-400.pdf",
    effectiveDate: "2024-05-15",
    batchNumberSeries: "B-IBU-2024-XXX",
    startPage: 1,
    endPage: 16,
    description: "Non-steroidal anti-inflammatory tablet formulation and compression",
    status: "active",
    workflowStatus: "Approved",
    branch: "Masulkhana",
    genericName: "Ibuprofen",
    dosageForm: "Film-Coated Tablet",
    strength: "400mg",
    shelfLifeMonths: 36,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// ==========================================
// 6. BATCH SHEET MASTERS (TEMPLATES)
// ==========================================
const TEMPLATES = [
  {
    id: "temp-001",
    productId: "prod-001",
    templateName: "PARA-500-STD-V1",
    masterName: "PARA-500-STD-V1",
    version: "1.0",
    status: "APPROVED",
    branch: "Masulkhana",
    documentNumber: "SOP-PARA-500",
    batchNumberSeries: "B-PARA-2024-XXX",
    description: "Standard Master Manufacturing Record for Paracetamol 500mg (Batch size 100,000 units)",
    steps_json: [
      {
        step_number: 1,
        title: "Raw Material Dispensing & Line Clearance",
        description: "Verify dispensing booth line clearance, calibrate balance, and weigh Paracetamol active ingredient (50.0 kg), Starch (10.0 kg), and Magnesium Stearate (0.5 kg).",
        equipment: "Dispensing Booth DB-01, Analytical Balance BAL-04",
        expected_time: "2 hours",
        parameters: [
          { name: "Room Temperature", target: "22.0", min: "20.0", max: "25.0", unit: "°C" },
          { name: "Relative Humidity", target: "45.0", min: "35.0", max: "55.0", unit: "%" },
          { name: "API Net Weight", target: "50.0", min: "49.8", max: "50.2", unit: "kg" }
        ]
      },
      {
        step_number: 2,
        title: "Wet Granulation & Fluid Bed Drying",
        description: "Load active blend into High Shear Mixer, add starch paste binder, granulate for 8 minutes, then dry in FBD until LOD is between 1.5% and 2.5%.",
        equipment: "High Shear Mixer HSM-02, Fluid Bed Dryer FBD-01",
        expected_time: "4 hours",
        parameters: [
          { name: "Impeller Speed", target: "150", min: "140", max: "160", unit: "RPM" },
          { name: "Binder Addition Time", target: "5.0", min: "4.5", max: "5.5", unit: "min" },
          { name: "Inlet Air Temperature", target: "65.0", min: "60.0", max: "70.0", unit: "°C" },
          { name: "Final Loss on Drying (LOD)", target: "2.0", min: "1.5", max: "2.5", unit: "%" }
        ]
      },
      {
        step_number: 3,
        title: "Lubrication & Rotary Tablet Compression",
        description: "Sift dried granules through #20 mesh, blend with lubricant in Octagonal Blender for 5 min, compress on 27-station rotary tablet press.",
        equipment: "Octagonal Blender OB-01, Rotary Tablet Press TP-03",
        expected_time: "6 hours",
        parameters: [
          { name: "Average Tablet Weight", target: "605.0", min: "590.0", max: "620.0", unit: "mg" },
          { name: "Tablet Hardness", target: "7.5", min: "6.0", max: "9.5", unit: "kp" },
          { name: "Friability", target: "0.4", min: "0.0", max: "0.8", unit: "%" },
          { name: "Disintegration Time", target: "8.0", min: "0.0", max: "15.0", unit: "min" }
        ]
      }
    ],
    recordCount: 0,
    isLocked: false,
    isDeleted: false,
    createdBy: "admin-user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "temp-002",
    productId: "prod-002",
    templateName: "AMOX-250-CAP-V1",
    masterName: "AMOX-250-CAP-V1",
    version: "1.0",
    status: "APPROVED",
    branch: "Baddi",
    documentNumber: "PRO-AMOX-250",
    batchNumberSeries: "B-AMOX-2024-XXX",
    description: "Master Encapsulation Record for Amoxicillin 250mg Hard Gelatin Capsules",
    steps_json: [
      {
        step_number: 1,
        title: "Dispensing & Double Sifting",
        description: "Dispense Amoxicillin Trihydrate compact powder and excipients in dedicated antibiotic facility.",
        equipment: "Cleanroom Booth AB-01, Vibratory Sifter VS-02",
        expected_time: "2 hours",
        parameters: [
          { name: "API Assay Purity", target: "99.5", min: "98.0", max: "101.5", unit: "%" },
          { name: "Room Differential Pressure", target: "15.0", min: "10.0", max: "20.0", unit: "Pa" }
        ]
      },
      {
        step_number: 2,
        title: "Blending & Lubrication",
        description: "Charge powder into Double Cone Blender and blend for 12 minutes.",
        equipment: "Double Cone Blender DCB-01",
        expected_time: "2 hours",
        parameters: [
          { name: "Blend Uniformity RSD", target: "2.1", min: "0.0", max: "5.0", unit: "%" }
        ]
      },
      {
        step_number: 3,
        title: "Automatic Encapsulation (Size 1 Shells)",
        description: "Fill blend into Size 1 hard gelatin capsules, check fill weights every 15 minutes.",
        equipment: "Automatic Capsule Filler AF-40",
        expected_time: "6 hours",
        parameters: [
          { name: "Average Filled Capsule Weight", target: "320.0", min: "305.0", max: "335.0", unit: "mg" },
          { name: "Machine Speed", target: "40000", min: "35000", max: "42000", unit: "caps/hr" }
        ]
      }
    ],
    recordCount: 0,
    isLocked: false,
    isDeleted: false,
    createdBy: "admin-user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "temp-003",
    productId: "prod-003",
    templateName: "COUGH-SYP-STD-V1",
    masterName: "COUGH-SYP-STD-V1",
    version: "1.0",
    status: "APPROVED",
    branch: "Masulkhana",
    documentNumber: "FOR-COUGH-SYP",
    batchNumberSeries: "B-COUGH-2024-XXX",
    description: "Liquid Syrup Preparation, Filtration and Automated Bottling",
    steps_json: [
      {
        step_number: 1,
        title: "Sugar Syrup Base Preparation",
        description: "Dissolve sucrose in purified water at 75°C in jacketed manufacturing vessel.",
        equipment: "Jacketed Stainless Steel Vessel MV-500",
        expected_time: "3 hours",
        parameters: [
          { name: "Temperature", target: "75.0", min: "70.0", max: "80.0", unit: "°C" },
          { name: "Specific Gravity", target: "1.28", min: "1.25", max: "1.30", unit: "g/ml" }
        ]
      },
      {
        step_number: 2,
        title: "Active Ingredient Dissolution & Sparkler Filtration",
        description: "Cool to 35°C, add active components, pass through Sparkler filter press.",
        equipment: "Sparkler Filter Press SFP-01",
        expected_time: "2 hours",
        parameters: [
          { name: "pH Value", target: "5.5", min: "5.0", max: "6.0", unit: "pH" },
          { name: "Filtration Pressure", target: "2.0", min: "1.5", max: "2.5", unit: "bar" }
        ]
      },
      {
        step_number: 3,
        title: "Liquid Filling, Capping & Labeling",
        description: "Fill 100ml amber PET bottles, induction seal, and torque cap.",
        equipment: "Liquid Monoblock Filling Machine LFM-08",
        expected_time: "5 hours",
        parameters: [
          { name: "Net Fill Volume", target: "100.0", min: "99.0", max: "102.0", unit: "ml" },
          { name: "Cap Torque", target: "12.0", min: "10.0", max: "15.0", unit: "lbf-in" }
        ]
      }
    ],
    recordCount: 0,
    isLocked: false,
    isDeleted: false,
    createdBy: "admin-user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// ==========================================
// 7. BATCH NUMBER ENGINE MASTERS & FORMATS
// ==========================================
const BATCH_NUMBER_MASTERS = [
  // Stages
  { type: "stage", code: "GRAN", name: "Granulation Stage", description: "Granulation process stage", branch: "Masulkhana", status: "ACTIVE" },
  { type: "stage", code: "COMP", name: "Compression Stage", description: "Compression process stage", branch: "Masulkhana", status: "ACTIVE" },
  { type: "stage", code: "COAT", name: "Coating Stage", description: "Tablet coating stage", branch: "Masulkhana", status: "ACTIVE" },
  { type: "stage", code: "PACK", name: "Packaging Stage", description: "Final packaging stage", branch: "Masulkhana", status: "ACTIVE" },
  { type: "stage", code: "BLND", name: "Blending Stage", description: "Capsule blending stage", branch: "Baddi", status: "ACTIVE" },
  
  // Generic codes
  { type: "generic_code", code: "GEN-PARA", name: "Paracetamol Generic", description: "Paracetamol molecule code", branch: "Masulkhana", status: "ACTIVE" },
  { type: "generic_code", code: "GEN-AMOX", name: "Amoxicillin Generic", description: "Amoxicillin molecule code", branch: "Baddi", status: "ACTIVE" },
  { type: "generic_code", code: "GEN-MET", name: "Metformin Generic", description: "Metformin molecule code", branch: "Baddi", status: "ACTIVE" },
  { type: "generic_code", code: "GEN-IBU", name: "Ibuprofen Generic", description: "Ibuprofen molecule code", branch: "Masulkhana", status: "ACTIVE" },

  // Recovery components
  { type: "recovery_component", code: "REC-01", name: "Standard Recovery", description: "Standard blend recovery", branch: "Masulkhana", status: "ACTIVE" },
  { type: "recovery_component", code: "REC-02", name: "Secondary Recovery", description: "Secondary sifted recovery", branch: "Masulkhana", status: "ACTIVE" },

  // Process codes
  { type: "process_code", code: "PRC-DISP", name: "Dispensing Process", description: "Dispensing operation code", branch: "Masulkhana", status: "ACTIVE" },
  { type: "process_code", code: "PRC-GRAN", name: "Granulation Process", description: "Granulation operation code", branch: "Masulkhana", status: "ACTIVE" },
  { type: "process_code", code: "PRC-COMP", name: "Compression Process", description: "Compression operation code", branch: "Masulkhana", status: "ACTIVE" },

  // Base batch numbers
  { type: "base_batch_number", code: "B-BASE-01", name: "Base Series 01", description: "Standard base series code", branch: "Masulkhana", status: "ACTIVE" },
  { type: "base_batch_number", code: "B-BASE-02", name: "Base Series 02", description: "High-potency base series code", branch: "Baddi", status: "ACTIVE" }
];

const BATCH_NUMBER_FORMATS = [
  {
    id: "bnf-masulkhana-01",
    formatCode: "BNF-MAS-STD",
    formatName: "Masulkhana Standard Batch Number Format",
    branch: "Masulkhana",
    prefix: "BMR-",
    suffix: "",
    status: "ACTIVE",
    tokens: [
      { id: "tok-1", name: "Base Batch Number", type: "auto_generated", source: "base_batch_number", mandatory: true },
      { id: "tok-2", name: "/", type: "static_text", source: "/", mandatory: true },
      { id: "tok-3", name: "Stage Code", type: "master_lookup", source: "stage_code", mandatory: true },
      { id: "tok-4", name: "/", type: "static_text", source: "/", mandatory: true },
      { id: "tok-5", name: "Material", type: "collection", source: "recovery_component", separator: "+", mandatory: true }
    ],
    elements: [
      { id: "el-1", type: "fixed_text", value: "BMR-", label: "Prefix" },
      { id: "el-2", type: "year", value: "YY", label: "Year (2 Digit)" },
      { id: "el-3", type: "separator", value: "-", label: "Hyphen" },
      { id: "el-4", type: "product_code", value: "PROD", label: "Product Code" },
      { id: "el-5", type: "separator", value: "-", label: "Hyphen" },
      { id: "el-6", type: "serial_number", length: 4, value: "0001", label: "4-Digit Counter" }
    ],
    sampleOutput: "BMR-26-PARA-0001",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "bnf-baddi-01",
    formatCode: "BNF-BAD-STD",
    formatName: "Baddi Standard Batch Number Format",
    branch: "Baddi",
    prefix: "BAD-",
    suffix: "",
    status: "ACTIVE",
    tokens: [
      { id: "tok-1", name: "Base Batch Number", type: "auto_generated", source: "base_batch_number", mandatory: true },
      { id: "tok-2", name: "/", type: "static_text", source: "/", mandatory: true },
      { id: "tok-3", name: "Generic Code", type: "master_lookup", source: "generic_code", mandatory: true },
      { id: "tok-4", name: "/", type: "static_text", source: "/", mandatory: true },
      { id: "tok-5", name: "Stage Code", type: "master_lookup", source: "stage_code", mandatory: true }
    ],
    elements: [
      { id: "el-1", type: "fixed_text", value: "BAD-", label: "Prefix" },
      { id: "el-2", type: "year", value: "YYYY", label: "Year (4 Digit)" },
      { id: "el-3", type: "separator", value: "/", label: "Slash" },
      { id: "el-4", type: "generic_code", value: "GEN", label: "Generic Code" },
      { id: "el-5", type: "separator", value: "/", label: "Slash" },
      { id: "el-6", type: "serial_number", length: 3, value: "001", label: "3-Digit Counter" }
    ],
    sampleOutput: "BAD-2026/AMOX/001",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// ==========================================
// 8. SAMPLE BATCH ISSUANCE & RECORDS
// ==========================================
const BATCH_REQUESTS = [
  {
    id: "batch-req-001",
    batchNumber: "BMR-26-PARA-0001",
    title: "Paracetamol 500mg - Batch #0001",
    productId: "prod-001",
    templateId: "temp-001",
    batchSize: "100,000 Tablets",
    manufacturingDate: "2026-08-15",
    expiryDate: "2029-08-14",
    status: "ISSUED",
    branch: "Masulkhana",
    issuedBy: "qa@brims.com",
    issuedAt: new Date().toISOString(),
    requestedBy: "prod.manager@brims.com",
    requestedAt: new Date().toISOString(),
    steps: TEMPLATES[0].steps_json,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "batch-req-002",
    batchNumber: "BAD-2026/AMOX/001",
    title: "Amoxicillin 250mg - Batch #0001",
    productId: "prod-002",
    templateId: "temp-002",
    batchSize: "50,000 Capsules",
    manufacturingDate: "2026-08-16",
    expiryDate: "2028-08-15",
    status: "IN_PROGRESS",
    branch: "Baddi",
    issuedBy: "qa@brims.com",
    issuedAt: new Date().toISOString(),
    requestedBy: "prod.manager@brims.com",
    requestedAt: new Date().toISOString(),
    steps: TEMPLATES[1].steps_json,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// ==========================================
// 9. USERS TO SEED
// ==========================================
const USERS_LIST = [
  {
    email: "shakshay04@gmail.com",
    displayName: "Akshay Sharma (Admin)",
    role: "ADMIN",
    department: "Quality Assurance",
    departmentId: "DEP-002",
    designation: "System Administrator",
    designationId: "DES-001",
    defaultBranch: "Masulkhana",
    allowedBranches: ["Masulkhana", "Baddi"],
    multiBranchAccess: true
  },
  {
    email: "qa@brims.com",
    displayName: "Dr. Sarah Jenkins (QA Head)",
    role: "QA",
    department: "Quality Assurance",
    departmentId: "DEP-002",
    designation: "QA Head / Manager",
    designationId: "DES-002",
    defaultBranch: "Masulkhana",
    allowedBranches: ["Masulkhana", "Baddi"],
    multiBranchAccess: true
  },
  {
    email: "prod.manager@brims.com",
    displayName: "Michael Chang (Production Lead)",
    role: "PRODUCTION_MANAGER",
    department: "Production",
    departmentId: "DEP-001",
    designation: "Production Manager",
    designationId: "DES-003",
    defaultBranch: "Masulkhana",
    allowedBranches: ["Masulkhana", "Baddi"],
    multiBranchAccess: true
  },
  {
    email: "operator@brims.com",
    displayName: "Alex Rivera (Senior Operator)",
    role: "OPERATOR",
    department: "Production",
    departmentId: "DEP-001",
    designation: "Shopfloor Operator",
    designationId: "DES-004",
    defaultBranch: "Masulkhana",
    allowedBranches: ["Masulkhana"],
    multiBranchAccess: false
  },
  {
    email: "admin@brims.com",
    displayName: "System Admin (BRIMS)",
    role: "ADMIN",
    department: "Quality Assurance",
    departmentId: "DEP-002",
    designation: "System Administrator",
    designationId: "DES-001",
    defaultBranch: "Masulkhana",
    allowedBranches: ["Masulkhana", "Baddi"],
    multiBranchAccess: true
  }
];

async function getOrCreateAuthUser(email: string): Promise<string> {
  const password = "password123";
  const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
  
  try {
    const res = await fetch(signUpUrl, {
      method: "POST",
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      headers: { "Content-Type": "application/json" }
    });
    const data: any = await res.json();
    if (res.ok && data.localId) {
      console.log(`   ✅ Created Auth user for ${email} -> UID: ${data.localId}`);
      return data.localId;
    }
    
    if (data.error?.message === "EMAIL_EXISTS") {
      const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
      const signInRes = await fetch(signInUrl, {
        method: "POST",
        body: JSON.stringify({ email, password, returnSecureToken: true }),
        headers: { "Content-Type": "application/json" }
      });
      const signInData: any = await signInRes.json();
      if (signInRes.ok && signInData.localId) {
        console.log(`   ℹ️ Found existing Auth user for ${email} -> UID: ${signInData.localId}`);
        return signInData.localId;
      }
    }
    console.warn(`   ⚠️ Auth signup response message for ${email}:`, data.error?.message);
    return `uid-${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
  } catch (err: any) {
    console.warn(`   ⚠️ Error handling Auth for ${email}:`, err.message);
    return `uid-${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }
}

async function runDatabaseSeed() {
  console.log("========================================================");
  console.log("🚀 BRIMS DATABASE INITIALIZATION & RESTORATION SCRIPT");
  console.log("========================================================");

  console.log("🔑 Authenticating anonymously with Client SDK...");
  const cred = await signInAnonymously(auth);
  console.log(`🔓 Logged in with anonymous UID: ${cred.user.uid}`);

  // 1. Permissions
  console.log("\n📦 1. Seeding Permissions...");
  for (const perm of PERMISSIONS) {
    await setDoc(doc(db, "permissions", perm.id), perm);
  }
  console.log(`   ✅ Seeded ${PERMISSIONS.length} Granular Permissions`);

  // 2. Roles
  console.log("\n👥 2. Seeding Base Roles...");
  for (const role of ROLES) {
    await setDoc(doc(db, "roles", role.id), role);
  }
  console.log(`   ✅ Seeded ${ROLES.length} Base Roles`);

  // 3. Departments
  console.log("\n🏢 3. Seeding Departments...");
  for (const dep of DEPARTMENTS) {
    await setDoc(doc(db, "departments", dep.id), dep);
  }
  console.log(`   ✅ Seeded ${DEPARTMENTS.length} Pharmaceutical Departments`);

  // 4. Designations
  console.log("\n🎖️ 4. Seeding Designations...");
  for (const des of DESIGNATIONS) {
    await setDoc(doc(db, "designationMaster", des.id), des);
    await setDoc(doc(db, "designations", des.id), des);
  }
  console.log(`   ✅ Seeded ${DESIGNATIONS.length} Designations with Permission Matrices`);

  // 5. Users
  console.log("\n👤 5. Seeding Users (Auth & Firestore)...");
  const crypto = await import("crypto");
  const defaultHash = crypto.createHash("sha256").update("password123").digest("hex");

  for (const u of USERS_LIST) {
    const uid = await getOrCreateAuthUser(u.email);
    const userRole = ROLES.find(r => r.id === u.role);
    const userPermissions = userRole ? userRole.permissions : ["batch:view"];

    const empId = u.email === "shakshay04@gmail.com" 
      ? "EMP-ADM-001" 
      : u.email === "admin@brims.com"
      ? "EMP-ADM-002"
      : u.email === "qa@brims.com"
      ? "EMP-QA-001"
      : u.email === "prod.manager@brims.com"
      ? "EMP-PROD-001"
      : "EMP-OP-001";

    const userDoc = {
      uid,
      email: u.email,
      displayName: u.displayName,
      fullName: u.displayName,
      username: u.email.split("@")[0],
      role: u.role,
      department: u.department,
      departmentId: u.departmentId,
      designation: u.designation,
      designationId: u.designationId,
      employeeId: empId,
      defaultBranch: u.defaultBranch,
      branch: u.defaultBranch,
      allowedBranches: u.allowedBranches,
      multiBranchAccess: u.multiBranchAccess,
      permissions: userPermissions,
      customPermissions: userPermissions,
      status: "active",
      hashedPassword: defaultHash,
      failedLoginAttempts: 0,
      maxLoginAttempts: 5,
      accountLockAfterFailedAttempts: true,
      passwordExpiry: "90 Days",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, "users", uid), userDoc);
    // Static email key document fallback for robust lookup
    await setDoc(doc(db, "users", u.email.toLowerCase()), userDoc);
    console.log(`   ✅ User Document created for: ${u.email} (empId: ${empId})`);
  }

  // 6. Product Masters
  console.log("\n💊 6. Seeding Product Masters...");
  for (const prod of PRODUCTS) {
    await setDoc(doc(db, "product_masters", prod.id), prod);
    await setDoc(doc(db, "products", prod.id), prod);
  }
  console.log(`   ✅ Seeded ${PRODUCTS.length} Product Masters across Masulkhana & Baddi`);

  // 7. Batch Sheet Masters (Templates)
  console.log("\n📄 7. Seeding Batch Sheet Masters...");
  for (const temp of TEMPLATES) {
    await setDoc(doc(db, "batch_sheet_masters", temp.id), temp);
    await setDoc(doc(db, "batch_record_templates", temp.id), temp);
  }
  console.log(`   ✅ Seeded ${TEMPLATES.length} Batch Sheet Master Templates with CPP/CQA parameters`);

  // 8. Batch Number Masters (Lookups)
  console.log("\n🔢 8. Seeding Batch Number Masters (Stages, Recovery, Generic Codes)...");
  for (let i = 0; i < BATCH_NUMBER_MASTERS.length; i++) {
    const item = BATCH_NUMBER_MASTERS[i];
    const docId = `bnm-${item.type}-${item.code.toLowerCase()}`;
    await setDoc(doc(db, "batch_number_masters", docId), item);
    await setDoc(doc(db, "master_lookups", docId), item);
  }
  console.log(`   ✅ Seeded ${BATCH_NUMBER_MASTERS.length} Option List Master Lookup Items`);

  // 9. Batch Number Formats
  console.log("\n📐 9. Seeding Batch Number Formats...");
  for (const fmt of BATCH_NUMBER_FORMATS) {
    await setDoc(doc(db, "batch_number_formats", fmt.id), fmt);
  }
  console.log(`   ✅ Seeded ${BATCH_NUMBER_FORMATS.length} Batch Number Generation Formats`);

  // 10. Production Batches & Requests
  console.log("\n🏭 10. Seeding Production Batches & Requests...");
  for (const b of BATCH_REQUESTS) {
    await setDoc(doc(db, "production_batches", b.id), b);
    await setDoc(doc(db, "batch_sheet_records", b.id), b);
    await setDoc(doc(db, "batch_sheet_requests", b.id), b);
  }
  console.log(`   ✅ Seeded ${BATCH_REQUESTS.length} Active Production Batches`);

  // 11. Initial Audit Trail Entry
  console.log("\n📜 11. Seeding System Audit Trail Record...");
  const auditId = `audit-init-${Date.now()}`;
  await setDoc(doc(db, "audit_logs", auditId), {
    auditId,
    module: "System Setup",
    action: "DATABASE_INITIALIZATION",
    performedBy: "System Administrator",
    userId: "shakshay04@gmail.com",
    role: "ADMIN",
    branch: "Masulkhana",
    timestamp: new Date().toISOString(),
    oldValue: null,
    newValue: { status: "RESTORED", timestamp: new Date().toISOString() },
    changeReason: "Complete database restoration and initialization conforming to 21 CFR Part 11 / EU Annex 11 standards",
    ipAddress: "127.0.0.1",
    userAgent: "BRIMS Auto-Seeder/1.0",
    operation: "CREATE"
  });
  console.log(`   ✅ Initialized Audit Trail entry (${auditId})`);

  console.log("\n========================================================");
  console.log("🎉 DATABASE RESTORATION & SEEDING COMPLETED SUCCESSFULLY!");
  console.log("========================================================");
  process.exit(0);
}

runDatabaseSeed().catch((err) => {
  console.error("❌ Seeding failed with error:", err);
  process.exit(1);
});
