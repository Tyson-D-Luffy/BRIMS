import { Router } from "express";
import { BatchSheetRecordController } from "../controllers/batchSheetRecord.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";
import { enforceLock } from "../middleware/locking.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { createRecordSchema, updateRecordSchema } from "../validations/batchSheetRecord.validation.ts";
import { authorizeWorkflowTransition } from "../middleware/workflowAuth.middleware.ts";

const router = Router();

// Routes for records
router.post(
  "/:id/records",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]),
  validate(createRecordSchema),
  BatchSheetRecordController.create
);

router.get(
  "/",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchSheetRecordController.getAll
);

router.get(
  "/:id/records",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchSheetRecordController.getByMasterId
);

router.get(
  "/:id/records/latest-approved",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchSheetRecordController.getLatestApproved
);

// Routes for individual records
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchSheetRecordController.getById
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]),
  authorizeWorkflowTransition("BATCH_SHEET_RECORD", "edit"),
  enforceLock("batch_sheet_records"),
  validate(updateRecordSchema),
  BatchSheetRecordController.update
);

router.get(
  "/:id/check-lock",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchSheetRecordController.checkLock
);

export default router;
