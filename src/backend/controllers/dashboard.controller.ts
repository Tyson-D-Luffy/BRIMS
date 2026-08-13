import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { DashboardService } from "../services/dashboard.service.ts";

export class DashboardController {
  static async getSummary(req: AuthRequest, res: Response) {
    try {
      const data = await DashboardService.getSummary((req as any).selectedBranch);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getBatchTrends(req: AuthRequest, res: Response) {
    try {
      const { range, startDate, endDate } = req.query;
      const data = await DashboardService.getBatchTrends(
        range as string, 
        startDate as string, 
        endDate as string,
        (req as any).selectedBranch
      );
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getProductUsage(req: AuthRequest, res: Response) {
    try {
      const data = await DashboardService.getProductUsage((req as any).selectedBranch);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getUserActivity(req: AuthRequest, res: Response) {
    try {
      const data = await DashboardService.getUserActivity((req as any).selectedBranch);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAuditActivity(req: AuthRequest, res: Response) {
    try {
      const data = await DashboardService.getAuditActivity((req as any).selectedBranch);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getRecentActivities(req: AuthRequest, res: Response) {
    try {
      const data = await DashboardService.getRecentActivities((req as any).selectedBranch);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
