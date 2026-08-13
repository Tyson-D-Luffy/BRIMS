import { Router } from "express";
import { DepartmentController } from "../controllers/department.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";
import { enforceSignature } from "../middleware/signature.middleware.ts";

const router = Router();

// Retrieve departments (Active & general filtered list)
router.get("/active", authenticateToken, DepartmentController.getActive);
router.get("/", authenticateToken, DepartmentController.getAll);
router.get("/:id", authenticateToken, DepartmentController.getById);
router.get("/:id/audit-logs", authenticateToken, DepartmentController.getAuditLogs);

// Add, Edit
router.post("/", authenticateToken, authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]), DepartmentController.create);
router.put("/:id", authenticateToken, authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]), DepartmentController.update);

// Workflow Transition endpoints with CFR Part 11 Electronic signature
router.post(
  "/:id/submit",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]),
  DepartmentController.submit
);

router.post(
  "/:id/approve",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA"]),
  enforceSignature("I confirm that I have reviewed, verified, and approved this Department Master definition. This action represents my electronic signature under 21 CFR Part 11 guidelines."),
  DepartmentController.approve
);

router.post(
  "/:id/activate",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA"]),
  enforceSignature("I certify that I am activating this Department Master record for live site operations. This action represents my electronic signature under 21 CFR Part 11 guidelines."),
  DepartmentController.activate
);

router.post(
  "/:id/obsolete",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA"]),
  enforceSignature("I certify that I am retirement-marking/obsoleting this Department Master record. This action represents my electronic signature under 21 CFR Part 11 guidelines."),
  DepartmentController.obsolete
);

router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(["ADMIN"]),
  enforceSignature("I certify that I am deleting this Department Master record. This action represents my electronic signature and is logged irreversibly under 21 CFR Part 11 guidelines."),
  DepartmentController.delete
);

export default router;
