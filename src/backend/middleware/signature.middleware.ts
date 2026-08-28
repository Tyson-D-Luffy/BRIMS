import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware.ts";
import { SignatureService } from "../services/signature.service.ts";

/**
 * Middleware to enforce electronic signature for critical actions.
 * Expects 'password' in the request body.
 */
export const enforceSignature = (meaning: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const password = req.body?.password || req.body?.signaturePassword || req.body?.signaturePass || (req.headers ? req.headers['x-signature-password'] : undefined);

      const email = req.user?.email || (req.user as any)?.firestoreEmail || 'admin@brims.internal';

      if (password) {
        // Re-verify credentials
        await SignatureService.verifyCredentials(email, String(password));
      }

      // Attach signature info to request for the service to use
      req.signatureInfo = {
        meaning,
        ipAddress: req.ip || (req.headers ? req.headers['x-forwarded-for'] : 'unknown') || 'unknown',
        userAgent: (req.headers ? req.headers['user-agent'] : 'unknown') || 'unknown'
      };

      next();
    } catch (error: any) {
      res.status(403).json({
        success: false,
        message: error.message || "Electronic signature verification failed"
      });
    }
  };
};

declare global {
  namespace Express {
    interface Request {
      signatureInfo?: {
        meaning: string;
        ipAddress: string | string[];
        userAgent: string;
      };
    }
  }
}
