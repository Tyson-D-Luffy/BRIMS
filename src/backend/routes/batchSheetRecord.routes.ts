import { Router } from "express";
import { BatchSheetRecordController } from "../controllers/batchSheetRecord.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";
import { enforceLock } from "../middleware/locking.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { createRecordSchema, updateRecordSchema } from "../validations/batchSheetRecord.validation.ts";

const router = Router();

// Routes for records
router.post(
  "/:id/records",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA"]),
  validate(createRecordSchema),
  BatchSheetRecordController.create
);

router.get(
  "/",
  authenticateToken,
  authorizeRoles(["ADMIN", "PRODUCTION_MANAGER", "QA"]),
  BatchSheetRecordController.getAll
);

router.get(
  "/:id/records",
  authenticateToken,
  authorizeRoles(["ADMIN", "PRODUCTION_MANAGER", "QA"]),
  BatchSheetRecordController.getByMasterId
);

router.get(
  "/:id/records/latest-approved",
  authenticateToken,
  authorizeRoles(["ADMIN", "PRODUCTION_MANAGER", "QA"]),
  BatchSheetRecordController.getLatestApproved
);

// Routes for individual records
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(["ADMIN", "PRODUCTION_MANAGER", "QA"]),
  BatchSheetRecordController.getById
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA"]),
  enforceLock("batch_sheet_records"),
  validate(updateRecordSchema),
  BatchSheetRecordController.update
);

router.get(
  "/:id/check-lock",
  authenticateToken,
  authorizeRoles(["ADMIN", "PRODUCTION_MANAGER", "QA"]),
  BatchSheetRecordController.checkLock
);

export default router;
