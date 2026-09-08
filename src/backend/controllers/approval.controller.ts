import { Response } from "express";
import { ApprovalService } from "../services/approval.service.ts";
import { BatchSheetRecordService } from "../services/batchSheetRecord.service.ts";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { hasBranchAccess } from "../middleware/branch.middleware.ts";

export class ApprovalController {
  static async submit(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const record = await BatchSheetRecordService.getRecordById(id);
      if (record && !hasBranchAccess(req, (record as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const result = await ApprovalService.submitForReview(id, req.user, req.signatureInfo);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async review(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const record = await BatchSheetRecordService.getRecordById(id);
      if (record && !hasBranchAccess(req, (record as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { comments } = req.body;

      const result = await ApprovalService.reviewRecord(id, comments, req.user, req.signatureInfo);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async approve(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const record = await BatchSheetRecordService.getRecordById(id);
      if (record && !hasBranchAccess(req, (record as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { comments } = req.body;

      const result = await ApprovalService.approveRecord(id, comments, req.user, req.signatureInfo);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async reject(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const record = await BatchSheetRecordService.getRecordById(id);
      if (record && !hasBranchAccess(req, (record as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { comments } = req.body;

      const result = await ApprovalService.rejectRecord(id, comments, req.user, req.signatureInfo);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async returnRecord(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const record = await BatchSheetRecordService.getRecordById(id);
      if (record && !hasBranchAccess(req, (record as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { returnReason, returnToStep, comments } = req.body;

      const result = await ApprovalService.returnRecord(id, returnReason, returnToStep, comments, req.user, req.signatureInfo);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async resubmit(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const record = await BatchSheetRecordService.getRecordById(id);
      if (record && !hasBranchAccess(req, (record as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { changeReason } = req.body;

      const result = await ApprovalService.resubmitRecord(id, changeReason, req.user, req.signatureInfo);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getPending(req: AuthRequest, res: Response) {
    try {
      const records = await ApprovalService.getPendingApprovals((req as any).selectedBranch);
      res.json({ success: true, data: records });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getHistory(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const record = await BatchSheetRecordService.getRecordById(id);
      if (record && !hasBranchAccess(req, (record as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const history = await ApprovalService.getApprovalHistory(id);
      res.json({ success: true, data: history });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
