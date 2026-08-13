import { Router } from "express";
import { DocumentController } from "../controllers/document.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";

const router = Router();

// Admin, QA, and Production Manager can download BMR PDFs
router.get("/batch/:id/pdf", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]), 
  DocumentController.downloadBatchPDF
);

router.get("/batch/:id/preview", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER"]), 
  DocumentController.previewBatch
);

export default router;
