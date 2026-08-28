import { Router } from "express";
import { BatchController } from "../controllers/batch.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { batchIssuanceSchema, updateBatchStatusSchema } from "../validations/batch.validation.ts";

const router = Router();

// Roles that can request or issue batches
router.post("/", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  validate(batchIssuanceSchema), 
  BatchController.issue
);

// All roles can view batches
router.get("/status-summary", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  BatchController.getSummary
);

router.get("/", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  BatchController.getAll
);

router.get("/:id", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  BatchController.getById
);

router.get("/:id/timeline", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  BatchController.getTimeline
);

router.get("/:id/print", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]), 
  BatchController.print
);

router.post("/:id/print", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]), 
  BatchController.printWithSignature
);

// Sequential Individual Batch Sheet Printing Endpoints
router.get("/:id/print-queue",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]),
  BatchController.getPrintQueue
);

router.post("/:id/sheets/:sheetId/start-print",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]),
  BatchController.startSheetPrint
);

router.post("/:id/sheets/:sheetId/complete-print",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]),
  BatchController.completeSheetPrint
);

router.post("/:id/sheets/:sheetId/report-issue",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]),
  BatchController.reportPrintingIssue
);

router.post("/:id/sheets/:sheetId/interrupt-print",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]),
  BatchController.interruptSheetPrint
);

router.post("/:id/sheets/:sheetId/unlock",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]),
  BatchController.unlockSheetPrint
);

router.post("/:id/sheets/:sheetId/release-lock",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]),
  BatchController.unlockSheetPrint
);

// Production Manager, QA and Admin can update status
router.put("/:id/status", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  validate(updateBatchStatusSchema), 
  BatchController.updateStatus
);
router.post("/:id/status", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  validate(updateBatchStatusSchema), 
  BatchController.updateStatus
);

router.put("/:id/approve", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.approve
);
router.post("/:id/approve", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.approve
);

router.put("/:id/reject", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.reject
);
router.post("/:id/reject", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.reject
);

router.post("/:id/return", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.returnBatch
);
router.put("/:id/return", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.returnBatch
);

export default router;
