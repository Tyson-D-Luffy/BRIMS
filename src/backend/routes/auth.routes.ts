import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.ts";
import { authenticateToken } from "../middleware/auth.middleware.ts";

const router = Router();

router.post("/login", AuthController.login);
router.post("/login-credentials", AuthController.loginCredentials);
router.post("/pre-login", AuthController.preLogin);
router.post("/record-failed-attempt", AuthController.recordFailedAttempt);
router.get("/me", authenticateToken, AuthController.me);
router.post("/complete-reset-password", authenticateToken, AuthController.completeResetPassword);

export default router;
