import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, getDocs } from "firebase/firestore";
import { ALL_SYSTEM_PERMISSIONS } from "../../constants/designationProfiles.ts";

export const BASE_FUNCTIONAL_ROLES = [
  {
    id: "ADMIN",
    name: "IT ADMIN",
    description: "System and User Administration, role matrices, security settings, and audit logs. Zero GMP business or batch operational authority.",
    permissions: [
      "user:manage",
      "audit:view"
    ]
  },
  {
    id: "QA_CHEMIST",
    name: "QA Chemist",
    description: "Authoring and drafting Product Masters, Batch Sheet Masters, and full QA Batch Issuance.",
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
    description: "Review and return authority across Product Masters, Batch Sheet Masters, Lookup maintenance, and full QA Batch Issuance.",
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
    description: "Highest approval, rejection, deactivation, and certification authority across Product Masters, Batch Sheet Masters, Lookups, and Organization Masters.",
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
    description: "Operational line execution authority: Batch creation, shopfloor custody receipt, and submission back for QA review.",
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

export class RoleService {
  static async getAllRoles() {
    try {
      await ensureAuth();
      const snapshot = await getDocs(collection(db, "roles"));
      const firestoreRoles = snapshot.docs.map((docSnap: any) => docSnap.data());
      // Filter out removed base functional roles (QA, PRODUCTION_MANAGER, OPERATOR, VIEWER)
      const sanitized = firestoreRoles.filter((r: any) => !["QA", "PRODUCTION_MANAGER", "OPERATOR", "VIEWER"].includes(r.id));
      
      const existingIds = new Set(sanitized.map((r: any) => r.id));
      const combined = [...sanitized];
      for (const baseRole of BASE_FUNCTIONAL_ROLES) {
        if (!existingIds.has(baseRole.id)) {
          combined.push(baseRole);
        }
      }
      return combined;
    } catch {
      return BASE_FUNCTIONAL_ROLES;
    }
  }

  static async getAllPermissions() {
    return ALL_SYSTEM_PERMISSIONS;
  }
}
