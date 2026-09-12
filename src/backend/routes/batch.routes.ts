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
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  validate(batchIssuanceSchema), 
  BatchController.issue
);

// All roles can view batches
router.get("/status-summary", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  BatchController.getSummary
);

router.get("/", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  BatchController.getAll
);

router.get("/:id", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  BatchController.getById
);

router.get("/:id/timeline", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  BatchController.getTimeline
);

router.get("/:id/print", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  BatchController.print
);

router.post("/:id/print", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  BatchController.printWithSignature
);

// Sequential Individual Batch Sheet Printing Endpoints
router.get("/:id/print-queue",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchController.getPrintQueue
);

router.post("/:id/sheets/:sheetId/log-action",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchController.logPrintAction
);

router.post("/:id/sheets/:sheetId/start-print",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchController.startSheetPrint
);

router.post("/:id/sheets/:sheetId/complete-print",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchController.completeSheetPrint
);

router.post("/:id/sheets/:sheetId/report-issue",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchController.reportPrintingIssue
);

router.post("/:id/sheets/:sheetId/interrupt-print",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchController.interruptSheetPrint
);

router.post("/:id/sheets/:sheetId/unlock",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchController.unlockSheetPrint
);

router.post("/:id/sheets/:sheetId/release-lock",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]),
  BatchController.unlockSheetPrint
);

// Granular Individual Batch Sheet Custody & Operational Handover Endpoints
router.post("/:id/sheets/handover",
  authenticateToken,
  authorizeWorkflowTransition("BATCH_ISSUANCE", "handover"),
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]),
  BatchController.handoverSheets
);

router.post("/:id/sheets/production-receive",
  authenticateToken,
  authorizeWorkflowTransition("BATCH_ISSUANCE", "receive_production"),
  authorizeRoles(["ADMIN", "PRODUCTION_INCHARGE"]),
  BatchController.productionReceiveSheets
);

router.post("/:id/sheets/send-qa-review",
  authenticateToken,
  authorizeWorkflowTransition("BATCH_ISSUANCE", "send_qa_review"),
  authorizeRoles(["ADMIN", "PRODUCTION_INCHARGE"]),
  BatchController.sendSheetsForQaReview
);

router.post("/:id/sheets/qa-receive",
  authenticateToken,
  authorizeWorkflowTransition("BATCH_ISSUANCE", "qa_receive"),
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]),
  BatchController.qaReceiveSheets
);

router.post("/:id/sheets/complete-qa-review",
  authenticateToken,
  authorizeWorkflowTransition("BATCH_ISSUANCE", "complete"),
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]),
  BatchController.completeQaReviewSheets
);

// Discarded Batch Sheet Physical Return & QA Reconciliation Endpoints
router.post("/:id/sheets/return-discarded-to-qa",
  authenticateToken,
  authorizeRoles(["ADMIN", "PRODUCTION_INCHARGE", "OPERATOR"]),
  BatchController.returnDiscardedSheetsToQa
);

router.post("/:id/sheets/receive-returned-discarded",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]),
  BatchController.receiveReturnedDiscardedSheets
);

// Production Incharge, QA and Admin can update status
router.put("/:id/status", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  validate(updateBatchStatusSchema), 
  BatchController.updateStatus
);
router.post("/:id/status", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  validate(updateBatchStatusSchema), 
  BatchController.updateStatus
);

router.put("/:id/approve", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "approve"),
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]), 
  BatchController.approve
);
router.post("/:id/approve", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "approve"),
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]), 
  BatchController.approve
);

router.put("/:id/reject", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "reject"),
  authorizeRoles(["ADMIN", "QA_MANAGER"]), 
  BatchController.reject
);
router.post("/:id/reject", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "reject"),
  authorizeRoles(["ADMIN", "QA_MANAGER"]), 
  BatchController.reject
);

router.post("/:id/return", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "return"),
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]), 
  BatchController.returnBatch
);
router.put("/:id/return", 
  authenticateToken, 
  authorizeWorkflowTransition("BATCH_ISSUANCE", "return"),
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]), 
  BatchController.returnBatch
);

export default router;
