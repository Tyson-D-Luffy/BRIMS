import { Router } from "express";
import { SignatureController } from "../controllers/signature.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";

const router = Router();

// Get signatures for a specific record
router.get(
  "/records/:id/signatures",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]),
  SignatureController.getByRecord
);

// Generic entity signature fetch
router.get(
  "/entities/:entityId/signatures",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]),
  SignatureController.getByEntity
);

export default router;
