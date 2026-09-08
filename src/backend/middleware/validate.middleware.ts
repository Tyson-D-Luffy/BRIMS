import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { AuditService } from "../services/audit.service.ts";

export const validate = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        // Log validation failure for security monitoring
        const user = (req as any).user;
        console.error(`[VALIDATION FAILURE] Path: ${req.path}, Method: ${req.method}. Errors:`, JSON.stringify(details, null, 2));
        if (user) {
          await AuditService.logAction(
            user.uid,
            user.email,
            "VALIDATION_FAILURE",
            "SYSTEM",
            "VALIDATION",
            null,
            { path: req.path, method: req.method, details },
            "Request failed validation"
          );
        } else {
          // Log anonymous validation failure
          console.warn(`[VALIDATION FAILURE] Anonymous request to ${req.path}:`, details);
        }

        const errorMsg = details.map((d) => (d.field ? `${d.field}: ` : "") + d.message).join("; ") || "Validation Error";
        return res.status(400).json({
          success: false,
          error: "Validation Error",
          message: errorMsg,
          details
        });
      }
      return next(error);
    }
  };
};
