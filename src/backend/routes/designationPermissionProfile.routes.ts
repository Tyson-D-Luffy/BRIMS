import { Router } from "express";
import { DesignationPermissionProfileController } from "../controllers/designationPermissionProfile.controller.ts";
import { authenticateToken, authorizePermissions, authorizeRoles } from "../middleware/auth.middleware.ts";

const router = Router();

// Retrieve profiles
router.get("/", authenticateToken, DesignationPermissionProfileController.getAll);
router.get("/:id", authenticateToken, DesignationPermissionProfileController.getById);
router.get("/designation/:designationName", authenticateToken, DesignationPermissionProfileController.getByDesignation);
router.get("/designation/:designationName/affected-users", authenticateToken, authorizePermissions(["user:manage"]), DesignationPermissionProfileController.getAffectedUsers);

// Admin-only profile modification and synchronization
router.put("/:id", authenticateToken, authorizePermissions(["user:manage"]), DesignationPermissionProfileController.update);
router.post("/designation/:designationName/sync-users", authenticateToken, authorizePermissions(["user:manage"]), DesignationPermissionProfileController.syncUsers);
router.post("/users/:userId/reset-defaults", authenticateToken, authorizePermissions(["user:manage"]), DesignationPermissionProfileController.resetUserDefaults);

export default router;
