import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware.ts";
import { AuditService } from "../services/audit.service.ts";

export interface RequestMetadata {
  ip: string;
  userAgent: string;
}

declare global {
  namespace Express {
    interface Request {
      metadata?: RequestMetadata;
    }
  }
}

export const captureMetadata = (req: AuthRequest, res: Response, next: NextFunction) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  req.metadata = {
    ip: Array.isArray(ip) ? ip[0] : ip,
    userAgent
  };

  // Perform Request Auditing for non-GET calls
  if (req.method !== 'GET' && !req.url.includes('/api/auth') && !req.url.includes('/health')) {
    // We log actions asynchronously to avoid blocking the main request
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const user = req.user;
        if (user) {
          let bodyToLog = undefined;
          if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            bodyToLog = { ...req.body };
            // Strip potentially huge or sensitive fields
            if (bodyToLog.password) bodyToLog.password = "********";
            if (bodyToLog.data && typeof bodyToLog.data === 'string' && bodyToLog.data.length > 5000) {
              bodyToLog.data = bodyToLog.data.substring(0, 5000) + "... (truncated)";
            }
          }

          AuditService.logAction(
            user.uid,
            user.email,
            `API_${req.method}_CALL`,
            req.url,
            "API_CALL",
            null,
            { 
              path: req.url, 
              method: req.method,
              statusCode: res.statusCode,
              body: bodyToLog
            },
            "Automatic API Call Logging",
            undefined,
            undefined,
            undefined,
            req.metadata?.ip,
            req.metadata?.userAgent
          ).catch(err => console.error("Request Logging Failed:", err.message));
        }
      }
    });
  }

  next();
};
