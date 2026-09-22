import { Router } from "express";
import { ComplianceGuardianController } from "../controllers/complianceGuardian.controller.ts";
import { authenticateToken } from "../middleware/auth.middleware.ts";

const router = Router();

// Continuous monitoring and scan
router.get("/scan", authenticateToken, ComplianceGuardianController.scan);

// Explainable AI deep dive
router.post("/explain", authenticateToken, ComplianceGuardianController.explainFinding);

// Human-in-the-loop feedback and retraining submission
router.post("/feedback", authenticateToken, ComplianceGuardianController.submitFeedback);

// Live AI Interceptor Transaction Log Stream
router.get("/interceptor-stream", authenticateToken, ComplianceGuardianController.getInterceptorStream);

// Human-in-the-Loop Retraining & Knowledge Base Ledger
router.get("/learning-base", authenticateToken, ComplianceGuardianController.getLearningBase);

// One-click Inspection Readiness Report
router.get("/inspection-report", authenticateToken, ComplianceGuardianController.generateInspectionReport);

export default router;
