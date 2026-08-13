import { Router } from "express";
import { DesignationController } from "../controllers/designation.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";
import { enforceSignature } from "../middleware/signature.middleware.ts";

const router = Router();

// Queries
router.get("/", authenticateToken, DesignationController.getAll);
router.get("/:id", authenticateToken, DesignationController.getById);
router.get("/:id/audit-logs", authenticateToken, DesignationController.getAuditLogs);
router.get("/:id/timeline", authenticateToken, DesignationController.getTimeline);

// Create / Edit
router.post("/", authenticateToken, DesignationController.create);
router.put("/:id", authenticateToken, DesignationController.update);

// Workflow transitions
router.post(
  "/:id/submit",
  authenticateToken,
  DesignationController.submit
);

router.post(
  "/:id/approve",
  authenticateToken,
  enforceSignature("I confirm that I have reviewed and verified this Designation Master definition. This action represents my electronic signature under 21 CFR Part 11 guidelines."),
  DesignationController.approve
);

router.post(
  "/:id/activate",
  authenticateToken,
  enforceSignature("I certify that I am approving and activating this Designation Master record. This action represents my electronic signature under 21 CFR Part 11 guidelines."),
  DesignationController.activate
);

router.post(
  "/:id/obsolete",
  authenticateToken,
  enforceSignature("I certify that I am retirement-marking/obsoleting this Designation Master record. This action represents my electronic signature under 21 CFR Part 11 guidelines."),
  DesignationController.obsolete
);

export default router;
