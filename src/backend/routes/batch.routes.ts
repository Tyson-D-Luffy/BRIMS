import { Router } from "express";
import { BatchController } from "../controllers/batch.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";
import { authorizeWorkflowTransition } from "../middleware/workflowAuth.middleware.ts";
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

router.post("/:id/sheets/:sheetId/log-action",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]),
  BatchController.logPrintAction
);

router.post("/:id/sheets/:sheetId/start-print",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]),
  BatchController.startSheetPrint
);

router.post("/:id/sheets/:sheetId/complete-print",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]),
  BatchController.completeSheetPrint
);

router.post("/:id/sheets/:sheetId/report-issue",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]),
  BatchController.reportPrintingIssue
);

router.post("/:id/sheets/:sheetId/interrupt-print",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]),
  BatchController.interruptSheetPrint
);

router.post("/:id/sheets/:sheetId/unlock",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]),
  BatchController.unlockSheetPrint
);

router.post("/:id/sheets/:sheetId/release-lock",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]),
  BatchController.unlockSheetPrint
);

// Granular Individual Batch Sheet Custody & Operational Handover Endpoints
router.post("/:id/sheets/handover",
  authenticateToken,
  authorizeWorkflowTransition("BATCH_ISSUANCE", "handover"),
  authorizeRoles(["ADMIN", "QA"]),
  BatchController.handoverSheets
);

router.post("/:id/sheets/production-receive",
  authenticateToken,
  authorizeWorkflowTransition("BATCH_ISSUANCE", "receive_production"),
  authorizeRoles(["ADMIN", "PRODUCTION_MANAGER", "OPERATOR"]),
  BatchController.productionReceiveSheets
);

router.post("/:id/sheets/send-qa-review",
  authenticateToken,
  authorizeWorkflowTransition("BATCH_ISSUANCE", "send_qa_review"),
  authorizeRoles(["ADMIN", "PRODUCTION_MANAGER", "OPERATOR"]),
  BatchController.sendSheetsForQaReview
);

router.post("/:id/sheets/qa-receive",
  authenticateToken,
  authorizeWorkflowTransition("BATCH_ISSUANCE", "qa_receive"),
  authorizeRoles(["ADMIN", "QA"]),
  BatchController.qaReceiveSheets
);

router.post("/:id/sheets/complete-qa-review",
  authenticateToken,
  authorizeWorkflowTransition("BATCH_ISSUANCE", "complete"),
  authorizeRoles(["ADMIN", "QA"]),
  BatchController.completeQaReviewSheets
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
  authorizeWorkflowTransition("BATCH_ISSUANCE", "approve"),
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.approve
);
router.post("/:id/approve", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "approve"),
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.approve
);

router.put("/:id/reject", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "reject"),
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.reject
);
router.post("/:id/reject", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "reject"),
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.reject
);

router.post("/:id/return", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "return"),
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.returnBatch
);
router.put("/:id/return", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "return"),
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.returnBatch
);

export default router;
