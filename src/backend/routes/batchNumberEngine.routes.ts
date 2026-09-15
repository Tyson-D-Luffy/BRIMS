import { Router } from "express";
import { BatchNumberEngineController } from "../controllers/batchNumberEngine.controller.ts";
import { authorizeWorkflowTransition } from "../middleware/workflowAuth.middleware.ts";
import { authorizePermissions, AuthRequest } from "../middleware/auth.middleware.ts";

const router = Router();

const resolveLookupAction = (req: AuthRequest, record: any): string => {
  const newStatus = req.body?.status;
  const currentStatus = record?.status || 'DRAFT';
  if (req.body?.isDeactivation || (currentStatus === 'ACTIVE' && newStatus === 'DRAFT' && !req.body?.code)) {
    return 'deactivate';
  }
  if (newStatus && newStatus !== currentStatus) {
    if (['PENDING_APPROVAL', 'REVIEW', 'UNDER_REVIEW'].includes(newStatus)) return 'submit';
    if (newStatus === 'ACTIVE') return ['INACTIVE', 'DEACTIVATED'].includes(currentStatus) ? 'activate' : 'approve';
    if (['INACTIVE', 'DEACTIVATED'].includes(newStatus)) return 'deactivate';
    if (newStatus === 'DRAFT') return currentStatus === 'ACTIVE' ? 'deactivate' : 'return';
  }
  return 'edit';
};

const resolveFormatAction = (req: AuthRequest, record: any): string => {
  if (req.body?.isEditing || req.body?.action === 'EDIT_FORMAT_LAYOUT') return 'edit';
  const newStatus = req.body?.status;
  if (newStatus === 'ACTIVE' && record?.status !== 'ACTIVE') return 'approve';
  if (['UNDER_REVIEW', 'REVIEW', 'PENDING_APPROVAL'].includes(newStatus) && record?.status !== newStatus) return 'submit';
  if (newStatus === 'DRAFT' && record?.status !== 'DRAFT') return 'return';
  return 'edit';
};

const resolveRecordAction = (req: AuthRequest, record: any): string => {
  const newStatus = req.body?.status;
  if (newStatus === 'APPROVED' || newStatus === 'ACTIVE') return 'approve';
  if (['PENDING_APPROVAL', 'UNDER_REVIEW', 'REVIEW'].includes(newStatus)) return 'submit';
  if (newStatus === 'DRAFT') return 'return';
  return 'edit';
};

// Masters / Lookups
router.get("/masters", BatchNumberEngineController.getMasters);
router.post("/masters", authorizePermissions(["lookup:create"]), BatchNumberEngineController.addMaster);
router.put(
  "/masters/:id",
  authorizeWorkflowTransition("MASTER_LOOKUP", resolveLookupAction),
  BatchNumberEngineController.updateMaster
);
router.delete(
  "/masters/:id",
  authorizeWorkflowTransition("MASTER_LOOKUP", "delete"),
  BatchNumberEngineController.deleteMaster
);

// Formats
router.get("/formats", BatchNumberEngineController.getFormats);
router.post(
  "/formats",
  (req: AuthRequest, res, next) => {
    if (req.body?.id) {
      return authorizeWorkflowTransition("BATCH_NUMBER_FORMAT", resolveFormatAction)(req, res, next);
    }
    return authorizePermissions(["format:create", "format:edit"])(req, res, next);
  },
  BatchNumberEngineController.saveFormat
);
router.delete(
  "/formats/:id",
  authorizeWorkflowTransition("BATCH_NUMBER_FORMAT", "delete"),
  BatchNumberEngineController.deleteFormat
);

// Records
router.get("/records", BatchNumberEngineController.getRecords);
router.post("/records", authorizePermissions(["batch_number:create"]), BatchNumberEngineController.addRecord);
router.put(
  "/records/:id",
  authorizeWorkflowTransition("BATCH_NUMBER_RECORD", resolveRecordAction),
  BatchNumberEngineController.updateRecord
);
router.delete(
  "/records/:id",
  authorizeWorkflowTransition("BATCH_NUMBER_RECORD", "delete"),
  BatchNumberEngineController.deleteRecord
);

router.post("/seed", BatchNumberEngineController.checkAndSeed);
router.post("/audit", BatchNumberEngineController.logAudit);
router.get("/audits", BatchNumberEngineController.getAudits);

export default router;
