import { Response } from "express";
import { BatchSheetMasterService } from "../services/batchSheetMaster.service.ts";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { hasBranchAccess } from "../middleware/branch.middleware.ts";

export class BatchSheetMasterController {
  static async create(req: AuthRequest, res: Response) {
    try {
      const master = await BatchSheetMasterService.createMaster({
        ...req.body,
        branch: (req as any).selectedBranch
      }, req.user, req.metadata);
      res.status(201).json({ success: true, data: master });
    } catch (error: any) {
      console.error("BatchSheetMasterController: Create failure:", error.message);
      res.status(error.message.includes("not found") ? 404 : 500).json({ 
        success: false, 
        message: error.message || "An unexpected error occurred while saving the master sheet."
      });
    }
  }

  static async getAll(req: AuthRequest, res: Response) {
    try {
      const masters = await BatchSheetMasterService.getAllMasters({ ...req.query, selectedBranch: (req as any).selectedBranch });
      res.json({ success: true, data: masters });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const master = await BatchSheetMasterService.getMasterById(req.params.id);
      if (master && !hasBranchAccess(req, (master as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      res.json({ success: true, data: master });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && !hasBranchAccess(req, (masterObj as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const master = await BatchSheetMasterService.updateMaster(req.params.id, req.body, req.user, req.metadata);
      res.json({ success: true, data: master });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && !hasBranchAccess(req, (masterObj as any).branch)) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { changeReason } = req.body;
      await BatchSheetMasterService.softDeleteMaster(req.params.id, changeReason, req.user);
      res.json({ success: true, message: "Batch Sheet Master deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async retire(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { changeReason } = req.body;
      const master = await BatchSheetMasterService.retireMaster(req.params.id, changeReason, req.user, req.signatureInfo);
      res.json({ success: true, data: master, message: "Batch Sheet Master retired successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async requestUpdate(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { changeReason } = req.body;
      const master = await BatchSheetMasterService.requestUpdateMaster(req.params.id, changeReason, req.user, req.signatureInfo);
      res.json({ success: true, data: master, message: "Batch Sheet Master update requested successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async submitForReview(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { changeReason } = req.body;
      const result = await BatchSheetMasterService.submitMasterForReview(req.params.id, changeReason, req.user, req.signatureInfo);
      res.json({ success: true, data: result, message: "Batch Sheet Master submitted for review successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async reviewMaster(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { comments } = req.body;
      const result = await BatchSheetMasterService.reviewMaster(req.params.id, comments, req.user, req.signatureInfo);
      res.json({ success: true, data: result, message: "Batch Sheet Master reviewed and forwarded for approval successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async returnMaster(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { returnReason, returnToStep, comments } = req.body;
      const result = await BatchSheetMasterService.returnMaster(req.params.id, returnReason, returnToStep, comments, req.user);
      res.json({ success: true, data: result, message: "Batch Sheet Master returned for correction successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async resubmit(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { changeReason } = req.body;
      const result = await BatchSheetMasterService.resubmitMaster(req.params.id, changeReason, req.user);
      res.json({ success: true, data: result, message: "Batch Sheet Master resubmitted successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async clone(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { newName } = req.body;
      const master = await BatchSheetMasterService.cloneMaster(req.params.id, newName, req.user);
      res.status(201).json({ success: true, data: master });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async duplicateSteps(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { sourceId, changeReason } = req.body;
      const master = await BatchSheetMasterService.duplicateSteps(sourceId, req.params.id, changeReason, req.user);
      res.json({ success: true, data: master });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async updateStep(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { stepNumber } = req.params;
      const { stepData, changeReason } = req.body;
      const result = await BatchSheetMasterService.updateSingleStep(
        req.params.id, 
        parseInt(stepNumber), 
        stepData, 
        changeReason, 
        req.user
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const { status, changeReason } = req.body;
      const master = await BatchSheetMasterService.updateStatus(req.params.id, status, changeReason, req.user);
      res.json({ success: true, data: master });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async checkLock(req: AuthRequest, res: Response) {
    try {
      const masterObj = await BatchSheetMasterService.getMasterById(req.params.id);
      if (masterObj && (masterObj as any).branch && (masterObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const result = await BatchSheetMasterService.isEditable(req.params.id);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }
}
