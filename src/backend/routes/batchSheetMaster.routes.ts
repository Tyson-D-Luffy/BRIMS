import { Router } from "express";
import { BatchSheetMasterController } from "../controllers/batchSheetMaster.controller.ts";
import { authenticateToken, authorizeRoles, authorizePermissions } from "../middleware/auth.middleware.ts";
import { enforceLock } from "../middleware/locking.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { enforceSignature } from "../middleware/signature.middleware.ts";
import { 
  masterSchema, 
  updateMasterSchema, 
  masterStatusSchema, 
  newRecordSchema,
  cloneMasterSchema,
  duplicateStepsSchema,
  updateStepSchema
} from "../validations/batchSheetMaster.validation.ts";

const router = Router();

// Admin and Production Manager can manage masters (now protected by strict permissions)
router.post(
  "/", 
  authenticateToken, 
  authorizePermissions(["batch_sheet_master:create"]), 
  validate(masterSchema), 
  BatchSheetMasterController.create
);

router.get(
  "/", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "PRODUCTION_MANAGER", "QA"]), 
  BatchSheetMasterController.getAll
);

router.get(
  "/:id", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "PRODUCTION_MANAGER", "QA"]), 
  BatchSheetMasterController.getById
);

router.put(
  "/:id", 
  authenticateToken, 
  authorizePermissions(["batch_sheet_master:edit"]), 
  enforceLock("batch_sheet_masters"),
  validate(updateMasterSchema), 
  BatchSheetMasterController.update
);

router.delete(
  "/:id", 
  authenticateToken, 
  authorizePermissions(["batch_sheet_master:deactivate"]), 
  enforceLock("batch_sheet_masters"),
  validate(newRecordSchema), 
  BatchSheetMasterController.delete
);

// Retire/Discontinue master with electronic signature
router.post(
  "/:id/retire",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:deactivate"]),
  enforceSignature("I certify that I am discontinuing this master record. This action is intentional and logged."),
  validate(newRecordSchema),
  BatchSheetMasterController.retire
);

// Request update for approved master
router.post(
  "/:id/request-update",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:edit"]),
  enforceSignature("I certify that I am requesting an update to this approved master record. This action will be logged and requires justification."),
  validate(newRecordSchema),
  BatchSheetMasterController.requestUpdate
);

router.post(
  "/:id/submit",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:submit"]),
  enforceSignature("I certify that I have reviewed the updates to this master record and am submitting it for QA approval."),
  validate(newRecordSchema),
  BatchSheetMasterController.submitForReview
);

router.post(
  "/:id/return",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:return", "batch_sheet_master:review", "batch_sheet_master:approve", "op:return_for_correction"]),
  enforceLock("batch_sheet_masters"),
  enforceSignature("Returned for Correction"),
  BatchSheetMasterController.returnMaster
);

router.post(
  "/:id/resubmit",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:submit", "batch_sheet_master:create", "batch_sheet_master:edit"]),
  enforceLock("batch_sheet_masters"),
  enforceSignature("Resubmitted after correction"),
  BatchSheetMasterController.resubmit
);

router.post(
  "/:id/clone", 
  authenticateToken, 
  authorizePermissions(["batch_sheet_master:create"]), 
  validate(cloneMasterSchema), 
  BatchSheetMasterController.clone
);

router.post(
  "/:id/duplicate-steps", 
  authenticateToken, 
  authorizePermissions(["batch_sheet_master:edit"]), 
  enforceLock("batch_sheet_masters"),
  validate(duplicateStepsSchema), 
  BatchSheetMasterController.duplicateSteps
);

router.put(
  "/:id/steps/:stepNumber", 
  authenticateToken, 
  authorizePermissions(["batch_sheet_master:edit"]), 
  enforceLock("batch_sheet_masters"),
  validate(updateStepSchema), 
  BatchSheetMasterController.updateStep
);

router.patch(
  "/:id/status", 
  authenticateToken, 
  authorizePermissions(["batch_sheet_master:edit", "batch_sheet_master:review", "batch_sheet_master:approve"]), 
  validate(masterStatusSchema), 
  BatchSheetMasterController.updateStatus
);

router.get(
  "/:id/check-lock", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "PRODUCTION_MANAGER", "QA"]), 
  BatchSheetMasterController.checkLock
);

export default router;
