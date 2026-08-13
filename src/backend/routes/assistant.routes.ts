import { Router } from "express";
import { AssistantController } from "../controllers/assistant.controller.ts";
import { authenticateToken } from "../middleware/auth.middleware.ts";

const router = Router();

// Secure POST endpoint for AI Chat Assistant
router.post("/chat", authenticateToken, AssistantController.chat);

export default router;
