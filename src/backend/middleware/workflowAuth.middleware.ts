import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware.ts";
import { db, ensureAuth } from "../config/firebase-client.ts";
import { adminDb } from "../config/firebase-admin.ts";
import { doc, getDoc } from "firebase/firestore";
import {
  WorkflowEntityType,
  canPerformWorkflowAction,
  normalizeWorkflowState,
  WorkflowAuthResult
} from "../../lib/workflowEngine.ts";

const ENTITY_COLLECTION_MAP: Record<WorkflowEntityType, string> = {
  PRODUCT_MASTER: "product_masters",
  BATCH_SHEET_MASTER: "batch_sheet_masters",
  BATCH_SHEET_RECORD: "batch_sheet_records",
  BATCH_ISSUANCE: "production_batches",
  BATCH_EXECUTION: "production_batches",
  BATCH_NUMBER_FORMAT: "batch_number_formats",
  BATCH_NUMBER_RECORD: "batch_number_records",
  MASTER_LOOKUP: "batch_number_masters",
  DEPARTMENT: "departments",
  DESIGNATION: "designationMaster",
  USER: "users"
};

/**
 * Extracts status from various entity schemas in BRIMS
 */
export function extractRecordWorkflowStatus(record: any, entityType: WorkflowEntityType): string {
  if (!record) return "DRAFT";

  // Entity-specific status priority
  if (entityType === "PRODUCT_MASTER") {
    return record.workflowStatus || record.status || "Draft";
  }
  if (entityType === "BATCH_SHEET_MASTER" || entityType === "BATCH_SHEET_RECORD") {
    return record.workflowStatus || record.status || "DRAFT";
  }
  if (entityType === "BATCH_ISSUANCE" || entityType === "BATCH_EXECUTION") {
    return record.status || record.workflowStatus || "DRAFT";
  }
  if (entityType === "BATCH_NUMBER_FORMAT" || entityType === "BATCH_NUMBER_RECORD") {
    return record.status || record.workflowStatus || "DRAFT";
  }
  if (entityType === "MASTER_LOOKUP") {
    return record.status || "DRAFT";
  }
  if (entityType === "DEPARTMENT" || entityType === "DESIGNATION") {
    return record.workflowStatus || record.status || "Draft";
  }

  return record.workflowStatus || record.status || record.currentStatus || "DRAFT";
}

/**
 * Centrally enforces Workflow-Stage-Based Authorization.
 * Rules:
 * 1. A user must NOT be able to perform any state-changing action unless authorized
 *    to act at the record's current workflow stage.
 * 2. If authorized at the current stage, only specifically permitted actions are allowed.
 * 3. Return actions are NOT global: only valid at stages where return is permitted and user has stage permission.
 * 4. IT/System Admins do NOT bypass stage authority for GMP workflow transitions.
 * 5. Returns HTTP 403 Forbidden with structured diagnostics on denial.
 */
export function authorizeWorkflowTransition(
  entityType: WorkflowEntityType,
  action: string | ((req: AuthRequest, record: any) => string),
  getRecordFn?: (req: AuthRequest) => Promise<any> | any
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication session required."
        });
      }

      const id = req.params?.id || req.body?.id || req.body?.recordId;
      let record: any = null;

      if (getRecordFn) {
        record = await getRecordFn(req);
      } else if (id) {
        const collName = ENTITY_COLLECTION_MAP[entityType];
        if (collName) {
          try {
            const adminDoc = await adminDb.collection(collName).doc(id).get();
            if (adminDoc.exists) {
              record = { id: adminDoc.id, ...adminDoc.data() };
            }
          } catch (adminErr) {
            // Fallback to client SDK
            try {
              await ensureAuth();
              const snap = await getDoc(doc(db, collName, id));
              if (snap.exists()) {
                record = { id: snap.id, ...snap.data() };
              }
            } catch (clientErr) {
              console.warn(`[workflowAuth] Client fallback fetch failed for ${collName}/${id}:`, clientErr);
            }
          }
        }
      }

      if (!record && id) {
        return res.status(404).json({
          success: false,
          code: "NOT_FOUND",
          message: `Record '${id}' not found for entity type '${entityType}'.`
        });
      }

      const currentStatus = extractRecordWorkflowStatus(record, entityType);
      const effectiveAction = typeof action === 'function' ? action(req, record) : action;

      // Evaluate Stage and Action Authorization
      const authResult: WorkflowAuthResult = canPerformWorkflowAction({
        user,
        entityType,
        currentStatus,
        action: effectiveAction,
        record
      });

      if (!authResult.allowed) {
        console.warn(
          `[WorkflowAuth DENIED] User: ${user.email} (${user.role || 'NoRole'}), Entity: ${entityType}, ID: ${id}, Status: ${currentStatus}, Action: ${effectiveAction}. Reason: ${authResult.reason}`
        );

        return res.status(403).json({
          success: false,
          code: "WORKFLOW_AUTHORIZATION_DENIED",
          message: authResult.reason,
          diagnostics: {
            entityType,
            recordId: id,
            currentStatus: authResult.currentStatus,
            stageName: authResult.stageName,
            stageAuthorized: authResult.stageAuthorized ?? false,
            actionAuthorized: authResult.actionAuthorized ?? false,
            stagePermissionRequired: authResult.stagePermissionRequired || [],
            actionPermissionRequired: authResult.actionPermissionRequired || [],
            userPermissions: (user as any).permissions || []
          }
        });
      }

      // Attach resolved record and auth validation to request object
      (req as any).workflowRecord = record;
      (req as any).workflowAuth = authResult;

      next();
    } catch (err: any) {
      console.error(`[WorkflowAuth ERROR] Transition check failed for ${entityType} / ${action}:`, err);
      return res.status(500).json({
        success: false,
        code: "INTERNAL_WORKFLOW_ERROR",
        message: "Internal error evaluating workflow authorization: " + err.message
      });
    }
  };
}
