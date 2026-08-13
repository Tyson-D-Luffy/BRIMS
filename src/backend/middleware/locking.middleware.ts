import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware.ts";
import { db, ensureAuth } from "../config/firebase-client.ts";
import { doc, getDoc } from "firebase/firestore";
import { AuditService } from "../services/audit.service.ts";

/**
 * Middleware to prevent modification of locked records.
 * @param collectionName The Firestore collection to check.
 */
export const enforceLock = (collectionName: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (!id) return next();

      await ensureAuth();
      const docRef = doc(db, collectionName, id);
      const recordDoc = await getDoc(docRef);

      if (!recordDoc.exists()) {
        return res.status(404).json({ success: false, message: "Record not found" });
      }

      const data = recordDoc.data();

      if (data?.isLocked === true) {
        // Log rejected action
        await AuditService.logAction(
          req.user.uid,
          req.user.email,
          "LOCKED_RECORD_MODIFICATION_ATTEMPT",
          id,
          collectionName.toUpperCase().replace(/S$/, ""), // Singularize entity type
          null,
          { attemptedAction: req.method, path: req.path },
          "RECORD_LOCKED"
        );

        return res.status(403).json({
          success: false,
          message: "This record is APPROVED and LOCKED. Modifications are strictly prohibited by GMP data integrity rules."
        });
      }

      next();
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
};
