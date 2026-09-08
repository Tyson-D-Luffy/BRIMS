# AGENTS.md — BRIMS (Batch Record & Issuance Management System) System Documentation & Knowledge Base

This document serves as the comprehensive knowledge base for BRIMS AI Assistants, Developers, and System Operators. It describes the application architecture, modules, security & compliance framework, Granular Operation Rights, and end-to-end task workflows.

---

## 1. System Overview & Purpose

**BRIMS (Batch Record & Issuance Management System)** is a cloud-based, 21 CFR Part 11 and EU Annex 11 / GMP compliant electronic Batch Manufacturing Record (eBMR) and Batch Packaging Record (eBPR) issuance and execution platform.

### Core Objectives:
- Eliminate paper-based batch manufacturing records and manual error-prone custody transfers.
- Enforce strict role-based access control (RBAC) and granular operation permissions across product masters, batch sheet templates, and operational batch issuance.
- Ensure 21 CFR Part 11 electronic signature requirements (dual authentication, reason for signature, timestamping, user identification).
- Maintain an immutable, tamper-evident audit trail for all data modifications, approvals, rejections, and lookups.

---

## 2. Roles, Granular Permissions & System Operation Rights

Access control in BRIMS is controlled via both **Base Roles** and **Granular System Operation Rights** defined in the Admin Panel (`Roles / Permission Matrix`).

### Key Roles:
1. **ADMIN**: Full system configuration, user management, branch configuration, audit log viewing, override authority.
2. **QA / QA REVIEWER / QA APPROVER**: Quality Assurance control over product masters, batch sheet templates, batch issuance approval, QA receipt, and returns for correction.
3. **PRODUCTION MANAGER / SUPERVISOR / LEAD**: Operational execution, batch creation, batch filling, submission for QA review, and equipment/process parameter verification.
4. **OPERATOR**: Direct shopfloor line execution, e-signing execution steps, logging process metrics.

### Granular System Operation Rights Categories:

#### A. Master Lookups Permissions
- `lookup:create` - Create Master Lookup (Stage, Recovery Component, Generic, Process, Base Batch Number)
- `lookup:edit` - Edit Master Lookup (Modify lookup code/description, resetting status to DRAFT for authorization pipeline)
- `lookup:submit` - Submit Master Lookup for authorization
- `lookup:approve` - Approve Master Lookup (Lock & certify lookup values)
- `lookup:activate` - Activate Master Lookups
- `lookup:deactivate` - Deactivate Master Lookups

#### B. Batch Issuance Operational Rights
- `op:issued` - Official Batch Material & Batch Sheet Issuance (`ISSUED`)
- `op:ready_for_handover` - Prepare Batch Custody Transfer (`READY_FOR_PRODUCTION_HANDOVER`)
- `op:production_in_progress` - Receive Custody in Production (`HANDED_OVER` -> `PRODUCTION_IN_PROGRESS`)
- `op:ready_for_qa_review` - Submit Completed Batch Back for QA Review ("Send back For QA Review" button visibility)
- `op:completed` - QA Received / Final Acceptance (`COMPLETED`)
- `op:return_for_correction` - Return Batch Sheet for Correction (`RETURNED`)

#### C. Product Master & Batch Sheet Master Rights
- `create:product`, `edit:product`, `product:submit` (Submit for GAMP Review button — assigned strictly to QA Chemist), `product:review`, `product:approve`, `product:reject`, `product:return`, `product:deactivate`
- `batch_sheet_master:create`, `batch_sheet_master:edit`, `batch_sheet_master:submit`, `batch_sheet_master:review`, `batch_sheet_master:approve`, `batch_sheet_master:reject`, `batch_sheet_master:return`, `batch_sheet_master:deactivate`

---

## 3. Core Modules & Functionality

### 1. Admin Panel & User Management
- Add/Edit Users with multi-branch association, department, designation, and custom permission assignment.
- Granular System Operation Rights Matrix allowing custom permission toggles per user or role preset.
- Password change & reset policies, user activation/deactivation.

### 2. Product Master Management
- Complete product specification repository (Product Name, Code, Dosage Form, Active Ingredients, Market Authorization, Shelf Life).
- Version control (Revision Numbers) and 4-eye workflow (Draft -> Submit -> QA Review -> QA Approval -> Active).

### 3. Batch Sheet Master (BMR/BPR Template Engine)
- Structured template builder for Master Batch Manufacturing & Packaging Records.
- Step-by-step process instructions, critical process parameters (CPPs), critical quality attributes (CQAs), equipment lists, and dynamic formula calculation blocks.
- Approval workflow ensuring only active, QA-approved master templates can be issued for production.

### 4. Batch Number Engine & Master Lookups
- Automated, rule-based batch number generation using configurable formulas (e.g., `[Prefix]-[ProductCode]-[YearCode]-[SequentialCounter]`).
- Master Lookup registers for Stage Codes, Recovery Components, Generic Codes, Process Codes, and Base Batch Numbers.
- All lookup records follow a strict Draft -> Submit -> Approve/Activate lifecycle with full edit and deactivation controls.

### 5. Batch Issuance & Execution (eBMR Operations)
- Instance creation from active Batch Sheet Masters.
- Interactive step filling, parameter tracking, electronic signatures per step, and status progression.

### 6. Interactive PDF Overlay & Annotation System (SecurePDFViewer)
- Dynamic PDF rendering with interactive stamp placement (Executed, Verified, Approved, QA Stamp, E-Sign overlays).
- Draggable overlay canvas allowing QA and Production personnel to position verification stamps directly on PDF generated batch records.
- Embedded watermark, security headers, and audit trail footers.

### 7. Audit Trail & Compliance Hub
- 21 CFR Part 11 compliant audit logging engine capturing:
  - User identity, email, and role.
  - Action category, entity type, entity ID.
  - Before and After state snapshots (JSON delta).
  - Explicit user intent / reason for change.
  - Cryptographic / password verified e-signatures.

---

## 4. End-to-End Operational Workflows

### A. Master Lookup Creation & Modification Workflow
1. **Creation**: User with `lookup:create` inputs Value/Code ID and optional description. Record is created in `DRAFT` status.
2. **Editing**: User with `lookup:edit` or `lookup:create` can edit non-ACTIVE or DRAFT lookup records. Saving triggers E-Signature verification and resets the record to `DRAFT` for re-approval.
3. **Submission**: User with `lookup:submit` submits DRAFT record for approval (`PENDING_APPROVAL`).
4. **Approval / Activation**: User with `lookup:approve` or `lookup:activate` signs to activate the lookup record (`ACTIVE`).
5. **Deactivation**: User with `lookup:deactivate` can deactivate active lookups (`INACTIVE`).

### B. Batch Issuance & Execution 8-Step Lifecycle
```
[1. Generation] ---> [2. QA Review] ---> [3. Official Issuance] ---> [4. Handover Prep]
  (DRAFT)             (APPROVED)              (ISSUED)             (READY_FOR_HANDOVER)
                                                                            |
                                                                            v
[8. Audit Archive] <--- [7. QA Received] <--- [6. Send to QA] <--- [5. Production Received]
   (COMPLETED)          (COMPLETED)       (READY_FOR_QA_REVIEW)    (PRODUCTION_IN_PROGRESS)
```

1. **Step 1 - Generation (DRAFT)**: Production / QA generates a new batch instance using an active Product Master and Batch Sheet Master.
2. **Step 2 - QA Review & Approval (PENDING_REVIEW -> APPROVED)**: QA verifies batch details, formula calculations, and planned yield.
3. **Step 3 - Official Issuance (ISSUED)**: Batch is officially issued (`op:issued` / `batch:print` permission required).
4. **Step 4 - Handover Preparation (READY_FOR_PRODUCTION_HANDOVER)**: QA prepares batch materials and custody sheet (`op:ready_for_handover` permission required).
5. **Step 5 - Production Receipt (HANDED_OVER -> PRODUCTION_IN_PROGRESS)**: Production Manager accepts physical and digital batch custody (`op:production_in_progress` permission required).
6. **Step 6 - Production Filling & Submission (READY_FOR_QA_REVIEW)**: Production executes BMR steps, completes parameter logs, and clicks **"Send back For QA Review"** (`op:ready_for_qa_review` / `batch:sign` / `batch:edit` permission required). Requires 21 CFR Part 11 e-signature.
7. **Step 7 - QA Review & QA Received (COMPLETED / RETURNED)**:
   - If acceptable: QA signs off and clicks **"QA Received"** (`op:completed` / `batch:approve` permission required). Batch status transitions to `COMPLETED`.
   - If corrections needed: QA clicks **"Return for Correction"** (`op:return_for_correction` permission required). Batch status transitions to `RETURNED`.
8. **Step 8 - Historic Archival & Compliance Logging**: Immutable storage in database, PDF lock with audit trail stamp.

---

## 5. Architectural & Technical Stack Reference

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Motion (Framer Motion), Sonner toasts, PDF-lib / jsPDF / React-PDF.
- **Backend**: Express.js, TypeScript (`tsx` runner in dev, `esbuild` bundled CJS in production), Node.js.
- **Database / Storage**: Firebase Firestore / Firebase Admin SDK for persistent cloud data, REST APIs with JWT & Role-Based authorization headers.
- **Port**: Container running behind Nginx proxy strictly on port 3000 (`0.0.0.0:3000`).

---

## 6. Guidelines for AI Assistants Answering User Queries

When responding to user questions regarding BRIMS:
1. **Be Precise & Domain-Aware**: Use standard pharmaceutical manufacturing terminology (e.g., eBMR, eBPR, 21 CFR Part 11, CPPs, CQAs, Audit Trail, Custody Transfer).
2. **Refer to Specific Permissions**: When answering "Why can't User X see button Y?", reference the specific Granular Permission ID (e.g., `op:ready_for_qa_review` for "Send back For QA Review", `lookup:edit` for "Edit Master Lookup").
3. **Explain Workflow Steps Clearly**: Always detail prerequisites and required E-Signatures for workflow state transitions.
4. **Maintain GMP Standards Context**: Remind users that all master edits, deletions, and operational sign-offs require electronic signatures with password re-verification and explicit reason logging.
