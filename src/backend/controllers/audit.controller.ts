import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { AuditService } from "../services/audit.service.ts";

export class AuditController {
  /**
   * Fetch Batch Process Audit logs with filters
   */
  static async getBatchLogs(req: AuthRequest, res: Response) {
    try {
      // Clean query filters
      const logs = await AuditService.getBatchLogs({ 
        ...req.query, 
        selectedBranch: (req as any).selectedBranch 
      });
      res.json({ success: true, data: logs });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Fetch System Administration / Security Audit logs with filters
   */
  static async getSystemAdminLogs(req: AuthRequest, res: Response) {
    try {
      const logs = await AuditService.getSystemAdminLogs({ 
        ...req.query, 
        selectedBranch: (req as any).selectedBranch 
      });
      res.json({ success: true, data: logs });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get single audit record by log ID (checks both collections)
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const log = await AuditService.getLogById(req.params.id);
      res.json({ success: true, data: log });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  /**
   * Run the legacy log migration
   */
  static async migrateLogs(req: AuthRequest, res: Response) {
    try {
      // Only administrators can trigger the manual migration api
      if (req.user?.role !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Only administrators can run manual migrations." });
      }

      const result = await AuditService.migrateExistingLogs();
      if (result.success) {
        res.json({ success: true, message: `Migration successful. Migrated ${result.migratedCount} legacy logs.`, migratedCount: result.migratedCount });
      } else {
        res.status(500).json({ success: false, message: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
