import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";

const router = Router();

// All authenticated roles can access basic dashboard summary and trends
router.get("/summary", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  DashboardController.getSummary
);

router.get("/batch-trends", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  DashboardController.getBatchTrends
);

router.get("/product-usage", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  DashboardController.getProductUsage
);

router.get("/user-activity", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  DashboardController.getUserActivity
);

router.get("/audit-activity", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER"]), 
  DashboardController.getAuditActivity
);

router.get("/recent-activities", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  DashboardController.getRecentActivities
);

router.get("/monthly-batch-requests", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  DashboardController.getMonthlyBatchRequests
);

export default router;
