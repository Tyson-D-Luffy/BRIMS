import { Router } from "express";
import { ProductMasterController } from "../controllers/productMaster.controller.ts";
import { authenticateToken, authorizeRoles, authorizePermissions } from "../middleware/auth.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { enforceSignature } from "../middleware/signature.middleware.ts";
import { productSchema, updateProductSchema, deleteProductSchema } from "../validations/productMaster.validation.ts";

const router = Router();

// Creations/Edits enabled for authorized team members with correct permissions
router.post("/", authenticateToken, authorizePermissions(["create:product"]), validate(productSchema), ProductMasterController.create);
router.put("/:id", authenticateToken, authorizePermissions(["edit:product"]), validate(updateProductSchema), ProductMasterController.update);

// Deactivation (Enforces Signature)
router.delete(
  "/:id", 
  authenticateToken, 
  authorizePermissions(["product:deactivate"]), 
  enforceSignature("I certify that I am deactivating this product. This action is intentional and logged."),
  validate(deleteProductSchema), 
  ProductMasterController.delete
);

// Workflow Transition endpoints
router.post(
  "/:id/submit", 
  authenticateToken, 
  authorizePermissions(["create:product", "edit:product"]), 
  enforceSignature("I confirm that this Product Master is accurate and ready for review. This action is electronic signature under 21 CFR Part 11."),
  ProductMasterController.submit
);
router.post(
  "/:id/start-review", 
  authenticateToken, 
  authorizePermissions(["product:review"]), 
  enforceSignature("I confirm that I am acquiring and beginning the formal review of this Product Master record. This action represents my electronic signature under 21 CFR Part 11."),
  ProductMasterController.startReview
);
router.post(
  "/:id/review", 
  authenticateToken, 
  authorizePermissions(["product:review"]), 
  enforceSignature("I confirm that I have reviewed this Product Master and am recording my recommendation/decision. This action is electronic signature under 21 CFR Part 11."),
  ProductMasterController.review
);

router.post(
  "/:id/approve", 
  authenticateToken, 
  authorizePermissions(["product:approve"]), 
  enforceSignature("I confirm approval of Product Master. This action is electronic signature under 21 CFR Part 11."),
  ProductMasterController.approve
);

router.post(
  "/:id/reject", 
  authenticateToken, 
  authorizePermissions(["product:reject", "product:review"]), 
  enforceSignature("I confirm rejection of Product Master. This action is electronic signature under 21 CFR Part 11."),
  ProductMasterController.reject
);

router.post(
  "/:id/correction", 
  authenticateToken, 
  authorizePermissions(["product:return", "product:review"]), 
  enforceSignature("I confirm that I have reviewed this Product Master and am returning it for correction. This action is electronic signature under 21 CFR Part 11."),
  ProductMasterController.returnCorrection
);

// Viewers access standard queries
router.get("/", authenticateToken, authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), ProductMasterController.getAll);
router.get("/masters", authenticateToken, authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), ProductMasterController.getWithMasters);
router.get("/:id", authenticateToken, authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), ProductMasterController.getById);

export default router;
