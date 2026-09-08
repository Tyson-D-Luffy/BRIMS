import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";

const router = Router();

// All authenticated roles can access basic dashboard summary and trends
router.get("/summary", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  DashboardController.getSummary
);

router.get("/batch-trends", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  DashboardController.getBatchTrends
);

router.get("/product-usage", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  DashboardController.getProductUsage
);

router.get("/user-activity", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]), 
  DashboardController.getUserActivity
);

router.get("/audit-activity", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA"]), 
  DashboardController.getAuditActivity
);

router.get("/recent-activities", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  DashboardController.getRecentActivities
);

router.get("/monthly-batch-requests", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), 
  DashboardController.getMonthlyBatchRequests
);

export default router;
