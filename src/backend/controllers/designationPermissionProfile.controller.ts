import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { DesignationPermissionProfileService } from "../services/designationPermissionProfile.service.ts";

export class DesignationPermissionProfileController {
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const profiles = await DesignationPermissionProfileService.getAllProfiles();
      res.json({
        success: true,
        data: profiles
      });
    } catch (error: any) {
      console.error("[DesignationPermissionProfileController.getAll Error]:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const profile = await DesignationPermissionProfileService.getProfileById(id);
      if (!profile) {
        return res.status(404).json({ success: false, message: `Profile ${id} not found` });
      }
      res.json({
        success: true,
        data: profile
      });
    } catch (error: any) {
      console.error("[DesignationPermissionProfileController.getById Error]:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getByDesignation(req: AuthRequest, res: Response) {
    try {
      const { designationName } = req.params;
      const profile = await DesignationPermissionProfileService.getProfileByDesignation(designationName);
      if (!profile) {
        return res.status(404).json({ success: false, message: `No profile found for designation: ${designationName}` });
      }
      res.json({
        success: true,
        data: profile
      });
    } catch (error: any) {
      console.error("[DesignationPermissionProfileController.getByDesignation Error]:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { permissions, reason } = req.body;

      if (!Array.isArray(permissions)) {
        return res.status(400).json({ success: false, message: "Permissions must be an array of strings" });
      }
      if (!reason || !reason.trim()) {
        return res.status(400).json({ success: false, message: "Reason for profile modification is mandatory for compliance" });
      }

      const updated = await DesignationPermissionProfileService.updateProfile(
        id,
        permissions,
        req.user,
        reason,
        req.metadata
      );

      res.json({
        success: true,
        data: updated,
        message: `Designation Permission Profile updated to Version ${updated.version}`
      });
    } catch (error: any) {
      console.error("[DesignationPermissionProfileController.update Error]:", error);
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getAffectedUsers(req: AuthRequest, res: Response) {
    try {
      const { designationName } = req.params;
      const result = await DesignationPermissionProfileService.getAffectedUsers(designationName);
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error("[DesignationPermissionProfileController.getAffectedUsers Error]:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async syncUsers(req: AuthRequest, res: Response) {
    try {
      const { designationName } = req.params;
      const { profileId, reason } = req.body;

      if (!profileId) {
        return res.status(400).json({ success: false, message: "profileId is required" });
      }
      if (!reason || !reason.trim()) {
        return res.status(400).json({ success: false, message: "Reason for user synchronization is required" });
      }

      const result = await DesignationPermissionProfileService.syncUsers(
        designationName,
        profileId,
        req.user,
        reason,
        req.metadata
      );

      res.json({
        success: true,
        data: result,
        message: result.message
      });
    } catch (error: any) {
      console.error("[DesignationPermissionProfileController.syncUsers Error]:", error);
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async resetUserDefaults(req: AuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({ success: false, message: "Reason for resetting permissions to defaults is required" });
      }

      const result = await DesignationPermissionProfileService.resetUserToDesignationDefaults(
        userId,
        req.user,
        reason,
        req.metadata
      );

      res.json({
        success: true,
        data: result.user,
        message: result.message
      });
    } catch (error: any) {
      console.error("[DesignationPermissionProfileController.resetUserDefaults Error]:", error);
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
