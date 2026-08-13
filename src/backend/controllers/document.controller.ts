import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { DocumentService } from "../services/document.service.ts";
import { BatchIssuanceService } from "../services/batch-issuance.service.ts";

export class DocumentController {
  /**
   * Generates and downloads the BMR PDF for a batch
   */
  static async downloadBatchPDF(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const batchRef = await BatchIssuanceService.getBatchById(id);
      if (batchRef && (batchRef as any).branch && (batchRef as any).branch.toLowerCase() !== ((req as any).selectedBranch || "").toLowerCase()) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      
      const user = (req as any).user;
      await DocumentService.generateBatchPDF(id, res, user);
    } catch (error: any) {
      console.error("PDF Generation Error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to generate PDF document",
        error: error.message 
      });
    }
  }

  /**
   * Preview endpoint (Optional - returns metadata or simplified view)
   */
  static async previewBatch(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const batchRef = await BatchIssuanceService.getBatchById(id);
      if (batchRef && (batchRef as any).branch && (batchRef as any).branch.toLowerCase() !== ((req as any).selectedBranch || "").toLowerCase()) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }

      res.json({
        success: true,
        data: {
          previewUrl: `/api/documents/batch/${id}/pdf`,
          format: "PDF",
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
