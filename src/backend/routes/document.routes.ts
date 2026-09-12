import { Router } from "express";
import { DocumentController } from "../controllers/document.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";

const router = Router();

// Admin, QA, and Production can download BMR PDFs
router.get("/batch/:id/pdf", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  DocumentController.downloadBatchPDF
);

router.get("/batch/:id/preview", 
  authenticateToken, 
  authorizeRoles(["ADMIN", "QA_CHEMIST", "QA_INCHARGE", "QA_MANAGER", "PRODUCTION_INCHARGE"]), 
  DocumentController.previewBatch
);

export default router;
