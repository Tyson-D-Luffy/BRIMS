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

// One-click Inspection Readiness Report
router.get("/inspection-report", authenticateToken, ComplianceGuardianController.generateInspectionReport);

export default router;
