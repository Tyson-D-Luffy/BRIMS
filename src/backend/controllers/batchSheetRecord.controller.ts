import { Response } from "express";
import { BatchSheetRecordService } from "../services/batchSheetRecord.service.ts";
import { BatchSheetMasterService } from "../services/batchSheetMaster.service.ts";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { hasBranchAccess } from "../middleware/branch.middleware.ts";

export class BatchSheetRecordController {
  static async create(req: AuthRequest, res: Response) {
    try {
      const { id: masterId } = req.params;
      const master = await BatchSheetMasterService.getMasterById(masterId);
      if (master && !hasBranchAccess(req, (master as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { changeReason } = req.body;
      const record = await BatchSheetRecordService.createRecord(masterId, changeReason, req.user);
      res.status(201).json({ success: true, data: record });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getByMasterId(req: AuthRequest, res: Response) {
    try {
      const { id: masterId } = req.params;
      const master = await BatchSheetMasterService.getMasterById(masterId);
      if (master && !hasBranchAccess(req, (master as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const records = await BatchSheetRecordService.getRecordsByMasterId(masterId, (req as any).selectedBranch);
      res.json({ success: true, data: records });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAll(req: AuthRequest, res: Response) {
    try {
      const records = await BatchSheetRecordService.getAllRecords((req as any).selectedBranch);
      res.json({ success: true, data: records });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const record = await BatchSheetRecordService.getRecordById(id);
      if (record && !hasBranchAccess(req, (record as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      res.json({ success: true, data: record });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const record = await BatchSheetRecordService.getRecordById(id);
      if (record && !hasBranchAccess(req, (record as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const updatedRecord = await BatchSheetRecordService.updateRecord(id, req.body, req.user);
      res.json({ success: true, data: updatedRecord });
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
      const { changeReason } = req.body;
      const approvedRecord = await BatchSheetRecordService.approveRecord(id, changeReason, req.user);
      res.json({ success: true, data: approvedRecord });
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
      const { changeReason } = req.body;
      const rejectedRecord = await BatchSheetRecordService.rejectRecord(id, changeReason, req.user);
      res.json({ success: true, data: rejectedRecord });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getLatestApproved(req: AuthRequest, res: Response) {
    try {
      const { id: masterId } = req.params;
      const master = await BatchSheetMasterService.getMasterById(masterId);
      if (master && !hasBranchAccess(req, (master as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const record = await BatchSheetRecordService.getLatestApprovedRecord(masterId);
      if (!record) {
        return res.status(404).json({ success: false, message: "No approved record found for this master" });
      }
      res.json({ success: true, data: record });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async checkLock(req: AuthRequest, res: Response) {
    try {
      const record = await BatchSheetRecordService.getRecordById(req.params.id);
      if (record && !hasBranchAccess(req, (record as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const result = await BatchSheetRecordService.isEditable(req.params.id);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }
}
