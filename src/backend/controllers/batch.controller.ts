import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { BatchIssuanceService } from "../services/batch-issuance.service.ts";
import { BatchSheetRecordService } from "../services/batchSheetRecord.service.ts";
import { BatchSheetMasterService } from "../services/batchSheetMaster.service.ts";

export class BatchController {
  static async issue(req: AuthRequest, res: Response) {
    try {
      const recordId = req.body.recordId;
      if (recordId) {
        try {
          const record = await BatchSheetRecordService.getRecordById(recordId);
          if (record && (record as any).branch && (record as any).branch !== (req as any).selectedBranch) {
            return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
          }
        } catch (error: any) {
          // If not found, check if it's a master doc ID (since issueBatch can resolve recordId from masterId)
          try {
            const master = await BatchSheetMasterService.getMasterById(recordId);
            if (master && (master as any).branch && (master as any).branch !== (req as any).selectedBranch) {
              return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
            }
          } catch (innerError) {
            // Rethrow the original record not found error if we can't find a master either
            throw error;
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
      if (batch && (batch as any).branch && (batch as any).branch !== (req as any).selectedBranch) {
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
      if (batch && (batch as any).branch && (batch as any).branch !== (req as any).selectedBranch) {
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
      if (batch && (batch as any).branch && (batch as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { password } = req.body;
      const data = await BatchIssuanceService.completePrintBatch(req.params.id, req.user, password, req.metadata);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const batch = await BatchIssuanceService.getBatchById(req.params.id);
      if (batch && (batch as any).branch && (batch as any).branch !== (req as any).selectedBranch) {
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
      if (batch && (batch as any).branch && (batch as any).branch !== (req as any).selectedBranch) {
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
      if (batch && (batch as any).branch && (batch as any).branch !== (req as any).selectedBranch) {
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
      if (batch && (batch as any).branch && (batch as any).branch !== (req as any).selectedBranch) {
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
      if (batch && (batch as any).branch && (batch as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const timeline = await BatchIssuanceService.getBatchTimeline(req.params.id);
      res.json({ success: true, data: timeline });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
