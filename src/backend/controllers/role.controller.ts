import { Request, Response } from "express";
import { RoleService } from "../services/role.service.ts";

export class RoleController {
  static async getRoles(req: Request, res: Response) {
    try {
      const roles = await RoleService.getAllRoles();
      res.json({
        success: true,
        data: roles
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getPermissions(req: Request, res: Response) {
    try {
      const permissions = await RoleService.getAllPermissions();
      res.json({
        success: true,
        data: permissions
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
