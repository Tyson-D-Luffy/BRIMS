import { Router } from "express";
import { SubscriptionController } from "../controllers/subscription.controller.ts";
import { authenticateToken } from "../middleware/auth.middleware.ts";

const router = Router();

router.get("/me", authenticateToken, SubscriptionController.getMySubscriptions);
router.post("/me", authenticateToken, SubscriptionController.updateSubscriptions);

export default router;
