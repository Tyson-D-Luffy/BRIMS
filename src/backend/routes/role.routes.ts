import { Router } from "express";
import { RoleController } from "../controllers/role.controller.ts";
import { authenticateToken } from "../middleware/auth.middleware.ts";

const router = Router();

router.get("/roles", authenticateToken, RoleController.getRoles);
router.get("/permissions", authenticateToken, RoleController.getPermissions);

export default router;
