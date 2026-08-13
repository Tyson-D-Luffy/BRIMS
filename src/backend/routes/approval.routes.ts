import { Router } from "express";
import { ApprovalController } from "../controllers/approval.controller.ts";
import { authenticateToken, authorizeRoles, authorizePermissions } from "../middleware/auth.middleware.ts";
import { enforceLock } from "../middleware/locking.middleware.ts";
import { enforceSignature } from "../middleware/signature.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { approveSchema, rejectSchema, submitSchema } from "../validations/approval.validation.ts";

const router = Router();

// Routes for /api/batch-sheet-records/:id/...
router.post(
  "/:id/submit",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:submit", "batch_sheet_master:create", "batch_sheet_master:edit"]),
  enforceLock("batch_sheet_records"),
  validate(submitSchema),
  enforceSignature("I am the author and I submit this record for review"),
  ApprovalController.submit
);

router.post(
  "/:id/approve",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:approve"]),
  enforceLock("batch_sheet_records"),
  validate(approveSchema),
  enforceSignature("I have reviewed this record and I approve it for production"),
  ApprovalController.approve
);

router.post(
  "/:id/reject",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:reject", "batch_sheet_master:review"]),
  enforceLock("batch_sheet_records"),
  validate(rejectSchema),
  enforceSignature("I have reviewed this record and I reject it for the reasons stated in the comments"),
  ApprovalController.reject
);

router.post(
  "/:id/return",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:return", "batch_sheet_master:review", "batch_sheet_master:approve", "op:return_for_correction"]),
  enforceLock("batch_sheet_records"),
  enforceSignature("Returned for Correction"),
  ApprovalController.returnRecord
);

router.post(
  "/:id/resubmit",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:submit", "batch_sheet_master:create", "batch_sheet_master:edit"]),
  enforceLock("batch_sheet_records"),
  enforceSignature("Resubmitted after correction"),
  ApprovalController.resubmit
);

router.get(
  "/:id/history",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:review", "batch_sheet_master:approve"]),
  ApprovalController.getHistory
);

// Route for /api/approvals/pending
router.get(
  "/pending",
  authenticateToken,
  authorizePermissions(["batch_sheet_master:review", "batch_sheet_master:approve"]),
  ApprovalController.getPending
);

export default router;
