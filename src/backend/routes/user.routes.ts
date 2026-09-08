import { Router } from "express";
import { UserController } from "../controllers/user.controller.ts";
import { authenticateToken, authorizeRoles } from "../middleware/auth.middleware.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { userSchema, updateUserSchema, assignRolesSchema } from "../validations/user.validation.ts";

const router = Router();

// Only Admin can create, update, delete or assign roles
router.post("/login-event", authenticateToken, UserController.loginEvent);
router.post("/", authenticateToken, authorizeRoles(["ADMIN"]), validate(userSchema), UserController.create);
router.get("/", authenticateToken, authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), UserController.getAll);
router.get("/:id", authenticateToken, authorizeRoles(["ADMIN", "QA", "PRODUCTION_MANAGER", "OPERATOR"]), UserController.getById);
router.put("/:id", authenticateToken, authorizeRoles(["ADMIN"]), validate(updateUserSchema), UserController.update);
router.delete("/:id", authenticateToken, authorizeRoles(["ADMIN"]), UserController.delete);
router.post("/:id/roles", authenticateToken, authorizeRoles(["ADMIN"]), validate(assignRolesSchema), UserController.assignRoles);

export default router;
