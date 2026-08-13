import { Response } from "express";
import { DepartmentService } from "../services/department.service.ts";
import { AuthRequest } from "../middleware/auth.middleware.ts";

export class DepartmentController {
  static async create(req: AuthRequest, res: Response) {
    try {
      const selectedBranch = (req as any).selectedBranch || "Masulkhana";
      const department = await DepartmentService.createDepartment({
        ...req.body,
        branch: selectedBranch
      }, req.user, req.metadata);

      res.status(201).json({
        success: true,
        data: department,
        message: "Department Master created successfully as Draft"
      });
    } catch (error: any) {
      console.error("DepartmentController.create error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create department"
      });
    }
  }

  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { code, name, status } = req.query;
      const selectedBranch = (req as any).selectedBranch;
      
      const departments = await DepartmentService.getAllDepartments({
        code,
        name,
        status,
        branch: selectedBranch
      });

      res.json({
        success: true,
        data: departments
      });
    } catch (error: any) {
      console.error("DepartmentController.getAll error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve departments"
      });
    }
  }

  static async getActive(req: AuthRequest, res: Response) {
    try {
      const selectedBranch = (req as any).selectedBranch;
      const departments = await DepartmentService.getActiveDepartments(selectedBranch);
      res.json({
        success: true,
        data: departments
      });
    } catch (error: any) {
      console.error("DepartmentController.getActive error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve active departments"
      });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const department = await DepartmentService.getDepartmentById(req.params.id);
      
      // Enforce branch segregation
      const selectedBranch = (req as any).selectedBranch;
      if (selectedBranch && !department.allowedBranches?.includes(selectedBranch)) {
        return res.status(403).json({
          success: false,
          message: "Access Denied. You do not have permissions to access this department from this branch."
        });
      }

      res.json({
        success: true,
        data: department
      });
    } catch (error: any) {
      console.error("DepartmentController.getById error:", error);
      res.status(404).json({
        success: false,
        message: error.message || "Department not found"
      });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const departmentObj = await DepartmentService.getDepartmentById(req.params.id);
      
      // Enforce branch segregation
      const selectedBranch = (req as any).selectedBranch;
      if (selectedBranch && !departmentObj.allowedBranches?.includes(selectedBranch)) {
        return res.status(403).json({
          success: false,
          message: "Access Denied. You do not have permissions to edit this department from this branch."
        });
      }

      const department = await DepartmentService.updateDepartment(req.params.id, req.body, req.user, req.metadata);
      res.json({
        success: true,
        data: department,
        message: department.status === "Draft" && departmentObj.status === "Active" 
          ? "Department master is active. A new Draft version has been successfully spawned."
          : "Department Master updated successfully"
      });
    } catch (error: any) {
      console.error("DepartmentController.update error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to update department"
      });
    }
  }

  static async submit(req: AuthRequest, res: Response) {
    try {
      const department = await DepartmentService.transitionWorkflow(req.params.id, "submit", req.body, req.user, req.signatureInfo);
      res.json({
        success: true,
        data: department,
        message: "Department submitted for review successfully"
      });
    } catch (error: any) {
      console.error("DepartmentController.submit error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to submit department for review"
      });
    }
  }

  static async approve(req: AuthRequest, res: Response) {
    try {
      const department = await DepartmentService.transitionWorkflow(req.params.id, "approve", req.body, req.user, req.signatureInfo);
      res.json({
        success: true,
        data: department,
        message: "Department reviewed and approved successfully"
      });
    } catch (error: any) {
      console.error("DepartmentController.approve error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to approve department"
      });
    }
  }

  static async activate(req: AuthRequest, res: Response) {
    try {
      const department = await DepartmentService.transitionWorkflow(req.params.id, "activate", req.body, req.user, req.signatureInfo);
      res.json({
        success: true,
        data: department,
        message: "Department activated successfully and is now active for operations"
      });
    } catch (error: any) {
      console.error("DepartmentController.activate error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to activate department"
      });
    }
  }

  static async obsolete(req: AuthRequest, res: Response) {
    try {
      const department = await DepartmentService.transitionWorkflow(req.params.id, "obsolete", req.body, req.user, req.signatureInfo);
      res.json({
        success: true,
        data: department,
        message: "Department retired to Obsolete status successfully"
      });
    } catch (error: any) {
      console.error("DepartmentController.obsolete error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to obsolete department"
      });
    }
  }

  static async getAuditLogs(req: AuthRequest, res: Response) {
    try {
      const logs = await DepartmentService.getDepartmentAuditLogs(req.params.id);
      res.json({
        success: true,
        data: logs
      });
    } catch (error: any) {
      console.error("DepartmentController.getAuditLogs error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch audit logs"
      });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const result = await DepartmentService.deleteDepartment(req.params.id, req.user, req.signatureInfo);
      res.json({
        success: true,
        data: result,
        message: "Department Master deleted successfully with E-sign control and audit trail logged."
      });
    } catch (error: any) {
      console.error("DepartmentController.delete error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to delete department"
      });
    }
  }
}
