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

// Production Manager, QA and Admin can update status
router.put("/:id/status", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]), 
  validate(updateBatchStatusSchema), 
  BatchController.updateStatus
);

router.put("/:id/approve", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.approve
);

router.put("/:id/reject", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.reject
);

router.post("/:id/return", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA"]), 
  BatchController.returnBatch
);

export default router;
