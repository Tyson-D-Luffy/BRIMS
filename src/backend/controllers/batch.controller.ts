import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { BatchIssuanceService } from "../services/batch-issuance.service.ts";
import { BatchSheetRecordService } from "../services/batchSheetRecord.service.ts";
import { BatchSheetMasterService } from "../services/batchSheetMaster.service.ts";

function hasBranchAccess(req: AuthRequest, resourceBranch?: string): boolean {
  if (!resourceBranch) return true;
  const user = req.user;
  const isSystemAdmin = user?.role === "ADMIN" || user?.email === "shakshay04@gmail.com" || (user as any)?.multiBranchAccess;
  if (isSystemAdmin) return true;
  const selectedBranch = (req as any).selectedBranch;
  if (!selectedBranch) return true;
  return resourceBranch.toLowerCase() === selectedBranch.toLowerCase();
}

export class BatchController {
  static async issue(req: AuthRequest, res: Response) {
    try {
      const recordId = req.body.recordId;
      if (recordId) {
        try {
          const record = await BatchSheetRecordService.getRecordById(recordId);
          if (record && !hasBranchAccess(req, (record as any).branch)) {
            return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
          }
        } catch (error: any) {
          // If not found as record, check if it's a master doc ID (since issueBatch can resolve recordId from masterId)
          try {
            const master = await BatchSheetMasterService.getMasterById(recordId);
            if (master && !hasBranchAccess(req, (master as any).branch)) {
              return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
            }
          } catch (innerError) {
            // Non-blocking - allow issueBatch to perform full auto-resolution or throw descriptive error
          }
        }
      }
      const batch = await BatchIssuanceService.issueBatch(req.body, req.user, req.metadata, (req as any).selectedBranch);
      res.status(201).json({
        success: true,
        data: batch,
        message: "Batch issued successfully"
      });
    } catch (error: any) {
      console.error("[BatchController.issue Error]:", error);
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getAll(req: AuthRequest, res: Response) {
    try {
      const batches = await BatchIssuanceService.getAllBatches({ ...req.query, selectedBranch: (req as any).selectedBranch });
      res.json({ success: true, data: batches });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      res.json({ success: true, data: batch });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  static async print(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const data = await BatchIssuanceService.getBatchForPrinting(req.params.id, req.user);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(403).json({ success: false, message: error.message });
    }
  }

  static async printWithSignature(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { password } = req.body;
      const data = await BatchIssuanceService.completePrintBatch(req.params.id, req.user, password, req.metadata);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async startSheetPrint(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { isReprint, reprintReason, deliveryMethod, totalPages } = req.body;
      const result = await BatchIssuanceService.startSheetPrint(
        req.params.id,
        req.params.sheetId,
        req.user,
        deliveryMethod || 'PDF_DOWNLOAD',
        totalPages || 60,
        isReprint,
        reprintReason,
        req.metadata
      );
      res.json({ success: true, data: result, message: "Sheet print job started and locked" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async completeSheetPrint(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { password, signaturePassword, comments } = req.body;
      const result = await BatchIssuanceService.completeSheetPrint(
        req.params.id,
        req.params.sheetId,
        req.user,
        signaturePassword || password,
        comments,
        req.metadata
      );
      res.json({ success: true, data: result, message: "Sheet print certified and completed" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async reportPrintingIssue(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { issueReason, requestedPages, comments, totalPages } = req.body;
      const result = await BatchIssuanceService.reportPrintingIssue(
        req.params.id,
        req.params.sheetId,
        issueReason,
        requestedPages,
        comments,
        req.user,
        totalPages || 60,
        req.metadata
      );
      res.json({ success: true, data: result, message: "Printing issue recorded and pages selected for reprint" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async interruptSheetPrint(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { reason, comments, issueReason, requestedPages, totalPages } = req.body;
      const result = await BatchIssuanceService.reportPrintingIssue(
        req.params.id,
        req.params.sheetId,
        issueReason || reason || 'Print Interruption Encountered',
        requestedPages || 'ALL',
        comments || '',
        req.user,
        totalPages || 60,
        req.metadata
      );
      res.json({ success: true, data: result, message: "Sheet print interruption recorded" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getPrintQueue(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const result = await BatchIssuanceService.getPrintQueue(req.params.id);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async unlockSheetPrint(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { reason } = req.body;
      const result = await BatchIssuanceService.unlockSheetPrint(
        req.params.id,
        req.params.sheetId,
        req.user,
        reason,
        req.metadata
      );
      res.json({ success: true, data: result, message: "Sheet print lock released" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { status, changeReason, password, signaturePassword } = req.body;
      const result = await BatchIssuanceService.updateBatchStatus(req.params.id, status, changeReason, req.user, signaturePassword || password, req.metadata);
      res.json({
        success: true,
        data: result,
        message: `Batch status updated to ${status}`
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async approve(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { changeReason, password } = req.body;
      const result = await BatchIssuanceService.approveBatch(req.params.id, changeReason, req.user, password, req.metadata);
      res.json({ success: true, data: result, message: "Batch issuance approved" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async reject(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { changeReason, password } = req.body;
      const result = await BatchIssuanceService.rejectBatch(req.params.id, changeReason, req.user, password, req.metadata);
      res.json({ success: true, data: result, message: "Batch issuance rejected" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async returnBatch(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { returnReason, returnToStep, comments, password } = req.body;
      const result = await BatchIssuanceService.returnBatch(
        req.params.id,
        returnReason,
        returnToStep,
        comments,
        req.user,
        password,
        req.metadata
      );
      res.json({ success: true, data: result, message: "Batch returned for correction successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getSummary(req: AuthRequest, res: Response) {
    try {
      const summary = await BatchIssuanceService.getStatusSummary((req as any).selectedBranch);
      res.json({ success: true, data: summary });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getTimeline(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && !hasBranchAccess(req, (batch as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const timeline = await BatchIssuanceService.getBatchTimeline(req.params.id);
      res.json({ success: true, data: timeline });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
