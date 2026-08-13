import { Router } from "express";
import { AuditController } from "../controllers/audit.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";

const router = Router();

// 1. Batch Process Audit Trail (Accessible to ADMIN and QA roles)
router.get("/batch",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA"]),
  AuditController.getBatchLogs
);

// 2. System Administration Audit Trail (Accessible ONLY to ADMIN roles)
router.get("/system",
  authenticateToken,
  authorizeRoles(["ADMIN"]),
  AuditController.getSystemAdminLogs
);

// 3. Trigger manual migration of legacy audit logs (Accessible ONLY to ADMIN roles)
router.post("/migrate",
  authenticateToken,
  authorizeRoles(["ADMIN"]),
  AuditController.migrateLogs
);

// 4. View detailed record of a log by ID (Accessible to ADMIN and QA roles)
router.get("/:id",
  authenticateToken,
  authorizeRoles(["ADMIN", "QA"]),
  AuditController.getById
);

export default router;
