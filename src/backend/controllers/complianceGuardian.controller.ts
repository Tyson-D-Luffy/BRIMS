import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { ComplianceGuardianService } from "../services/complianceGuardian.service.ts";

export class ComplianceGuardianController {
  /**
   * GET /api/compliance/scan?branch=Masulkhana
   */
  static async scan(req: AuthRequest, res: Response) {
    try {
      const branchName = (req.query.branch as string) || (req as any).selectedBranch || "Masulkhana";
      const result = await ComplianceGuardianService.scanBranchCompliance(branchName);

      return res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error("[COMPLIANCE_CONTROLLER] Error scanning branch compliance:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to execute AI Compliance Guardian scan."
      });
    }
  }

  /**
   * POST /api/compliance/explain
   */
  static async explainFinding(req: AuthRequest, res: Response) {
    try {
      const { finding } = req.body;
      if (!finding) {
        return res.status(400).json({ success: false, message: "Finding payload required." });
      }

      const explanation = await ComplianceGuardianService.getExplainableAnalysis(finding);
      return res.json({
        success: true,
        data: explanation
      });
    } catch (error: any) {
      console.error("[COMPLIANCE_CONTROLLER] Error generating explanation:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to generate AI explanation."
      });
    }
  }

  /**
   * POST /api/compliance/feedback
   */
  static async submitFeedback(req: AuthRequest, res: Response) {
    try {
      const { findingId, userDecision, actualRootCause, capaId, capaActionPlan, accuracyRating, notes } = req.body;
      const user = (req as any).user;

      if (!findingId || !userDecision) {
        return res.status(400).json({ success: false, message: "Finding ID and user decision are required." });
      }

      const result = await ComplianceGuardianService.submitHumanFeedback(
        findingId,
        user,
        userDecision,
        { actualRootCause, capaId, capaActionPlan, accuracyRating, notes }
      );

      return res.json({
        success: true,
        message: "Compliance feedback and learning entry recorded successfully.",
        data: result
      });
    } catch (error: any) {
      console.error("[COMPLIANCE_CONTROLLER] Error submitting feedback:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to record human feedback."
      });
    }
  }

  /**
   * GET /api/compliance/inspection-report
   */
  static async generateInspectionReport(req: AuthRequest, res: Response) {
    try {
      const branchName = (req.query.branch as string) || (req as any).selectedBranch || "Masulkhana";
      const user = (req as any).user;

      const report = await ComplianceGuardianService.generateInspectionReport(branchName, user);

      return res.json({
        success: true,
        data: report
      });
    } catch (error: any) {
      console.error("[COMPLIANCE_CONTROLLER] Error generating inspection report:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to generate Inspection Readiness Report."
      });
    }
  }
}
