import { Router } from "express";
import { NotificationController } from "../controllers/notification.controller.ts";
import { authenticateToken } from "../middleware/auth.middleware.ts";

const router = Router();

router.get("/me", authenticateToken, NotificationController.getMyNotifications);
router.get("/outbox", authenticateToken, NotificationController.getOutbox);
router.post("/test-email", authenticateToken, NotificationController.sendTestEmail);
router.post("/read-all", authenticateToken, NotificationController.markAllRead);
router.post("/:id/read", authenticateToken, NotificationController.markRead);

export default router;
