import { Response } from "express";
import { DesignationService } from "../services/designation.service.ts";
import { AuthRequest } from "../middleware/auth.middleware.ts";

export class DesignationController {
  static async create(req: AuthRequest, res: Response) {
    try {
      const designation = await DesignationService.createDesignation(req.body, req.user, req.metadata);
      res.status(201).json({
        success: true,
        data: designation,
        message: "Designation Master created successfully as Draft"
      });
    } catch (error: any) {
      console.error("DesignationController.create error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create designation"
      });
    }
  }

  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { code, name, departmentId, status } = req.query;
      const designations = await DesignationService.getAllDesignations({
        code,
        name,
        departmentId,
        status
      });

      res.json({
        success: true,
        data: designations
      });
    } catch (error: any) {
      console.error("DesignationController.getAll error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve designations"
      });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const designation = await DesignationService.getDesignationById(req.params.id);
      res.json({
        success: true,
        data: designation
      });
    } catch (error: any) {
      console.error("DesignationController.getById error:", error);
      res.status(404).json({
        success: false,
        message: error.message || "Designation master record not found"
      });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const existing = await DesignationService.getDesignationById(req.params.id);
      const designation = await DesignationService.updateDesignation(req.params.id, req.body, req.user, req.metadata);
      
      res.json({
        success: true,
        data: designation,
        message: designation.status === "Draft" && existing.status === "Active"
          ? "Designation master is active. A new Draft version has been successfully spawned."
          : "Designation Master updated successfully"
      });
    } catch (error: any) {
      console.error("DesignationController.update error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to update designation"
      });
    }
  }

  static async submit(req: AuthRequest, res: Response) {
    try {
      const designation = await DesignationService.transitionWorkflow(req.params.id, "submit", req.body, req.user, req.signatureInfo);
      res.json({
        success: true,
        data: designation,
        message: "Designation submitted for review successfully"
      });
    } catch (error: any) {
      console.error("DesignationController.submit error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to submit designation for review"
      });
    }
  }

  static async approve(req: AuthRequest, res: Response) {
    try {
      const designation = await DesignationService.transitionWorkflow(req.params.id, "approve", req.body, req.user, req.signatureInfo);
      res.json({
        success: true,
        data: designation,
        message: "Designation reviewed and approved successfully"
      });
    } catch (error: any) {
      console.error("DesignationController.approve error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to approve designation"
      });
    }
  }

  static async activate(req: AuthRequest, res: Response) {
    try {
      const designation = await DesignationService.transitionWorkflow(req.params.id, "activate", req.body, req.user, req.signatureInfo);
      res.json({
        success: true,
        data: designation,
        message: "Designation activated successfully and is now active for operations"
      });
    } catch (error: any) {
      console.error("DesignationController.activate error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to activate designation"
      });
    }
  }

  static async obsolete(req: AuthRequest, res: Response) {
    try {
      const designation = await DesignationService.transitionWorkflow(req.params.id, "obsolete", req.body, req.user, req.signatureInfo);
      res.json({
        success: true,
        data: designation,
        message: "Designation retired to Obsolete status successfully"
      });
    } catch (error: any) {
      console.error("DesignationController.obsolete error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to obsolete designation"
      });
    }
  }

  static async getAuditLogs(req: AuthRequest, res: Response) {
    try {
      const logs = await DesignationService.getDesignationAuditLogs(req.params.id);
      res.json({
        success: true,
        data: logs
      });
    } catch (error: any) {
      console.error("DesignationController.getAuditLogs error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch audit logs"
      });
    }
  }

  static async getTimeline(req: AuthRequest, res: Response) {
    try {
      const timeline = await DesignationService.getDesignationApprovalTimeline(req.params.id);
      res.json({
        success: true,
        data: timeline
      });
    } catch (error: any) {
      console.error("DesignationController.getTimeline error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch approval timeline"
      });
    }
  }
}
