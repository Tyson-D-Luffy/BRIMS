import { Response } from "express";
import { UserService } from "../services/user.service.ts";
import { AuthRequest } from "../middleware/auth.middleware.ts";

export class UserController {
  static async create(req: AuthRequest, res: Response) {
    try {
      console.log(`[USER_CONTROLLER] Creating user: ${req.body.email}`);
      const user = await UserService.createUser(req.body, req.user, req.metadata);
      res.status(201).json({
        success: true,
        data: user,
        message: "User created successfully"
      });
    } catch (error: any) {
      console.error(`[USER_CONTROLLER] Error creating user:`, error);
      res.status(400).json({ 
        success: false, 
        message: error.message || "Failed to create user",
        error: error.message,
        details: error.stack // In dev/admin cases this is helpful
      });
    }
  }

  static async getAll(req: AuthRequest, res: Response) {
    try {
      const users = await UserService.getAllUsers((req as any).selectedBranch);
      res.json({
        success: true,
        data: users
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const user = await UserService.getUserById(req.params.id);
      res.json({
        success: true,
        data: user
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const user = await UserService.updateUser(req.params.id, req.body, req.user, req.metadata);
      res.json({
        success: true,
        data: user,
        message: "User updated successfully"
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      await UserService.softDeleteUser(req.params.id, req.user);
      res.json({
        success: true,
        message: "User deactivated successfully"
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async assignRoles(req: AuthRequest, res: Response) {
    try {
      const { roles } = req.body;
      if (!Array.isArray(roles) || roles.length === 0) {
        return res.status(400).json({ success: false, message: "Roles array is required" });
      }
      const result = await UserService.assignRoles(req.params.id, roles, req.user);
      res.json({
        success: true,
        data: result,
        message: "Roles assigned successfully"
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async loginEvent(req: AuthRequest, res: Response) {
    try {
      await UserService.logLogin(req.user, req.metadata);
      res.json({ success: true, message: "Login event logged" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
