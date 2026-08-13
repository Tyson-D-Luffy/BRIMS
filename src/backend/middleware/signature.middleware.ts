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
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Password confirmation is required for electronic signature (21 CFR Part 11 compliance)"
        });
      }

      // Re-verify credentials
      await SignatureService.verifyCredentials(req.user.email, password);

      // Attach signature info to request for the service to use
      req.signatureInfo = {
        meaning,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown'
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
