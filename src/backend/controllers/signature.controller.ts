import { Response } from "express";
import { SignatureService } from "../services/signature.service.ts";
import { AuthRequest } from "../middleware/auth.middleware.ts";

export class SignatureController {
  static async getByRecord(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const signatures = await SignatureService.getSignaturesByRecord(id);
      res.json({ success: true, data: signatures });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getByEntity(req: AuthRequest, res: Response) {
    try {
      const { entityId } = req.params;
      const { entityType } = req.query;

      if (!entityType) {
        return res.status(400).json({ success: false, message: "entityType query parameter is required" });
      }

      const signatures = await SignatureService.getSignaturesByEntity(entityId, entityType as string);
      res.json({ success: true, data: signatures });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
