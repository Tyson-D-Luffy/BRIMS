import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { NotificationService } from "../services/notification.service.ts";

export class NotificationController {
  static async getMyNotifications(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      
      const notifications = await NotificationService.getNotificationsForUser(
        req.user.uid,
        req.user.role
      );
      
      res.json({ success: true, data: notifications });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async markRead(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { id } = req.params;
      
      await NotificationService.markAsRead(id, req.user.uid);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async markAllRead(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      
      await NotificationService.markAllAsRead(req.user.uid, req.user.role);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async sendTestEmail(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { to, title, message } = req.body;
      const recipient = to || req.user.email;
      const emailTitle = title || "BRIMS Alert: Notification System Test Connection";
      const emailMessage = message || "This is an on-demand verification email dispatched from the Batch Record Information Management System (BRIMS). Your secure email logging and alert sub-systems are fully active.";
      
      const result = await NotificationService.sendEmail(recipient, emailTitle, emailMessage);
      if (result?.status === "FAILED") {
        return res.status(400).json({ 
          success: false, 
          message: `SMTP Delivery Failed: ${result.error}. Please check your SMTP credentials or Gmail App Password.` 
        });
      }
      res.json({ success: true, message: `Test email successfully dispatched to ${recipient}` });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getOutbox(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const emails = await NotificationService.getOutbox();
      res.json({ success: true, data: emails });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
