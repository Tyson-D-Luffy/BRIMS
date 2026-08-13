import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { AssistantService } from "../services/assistant.service.ts";

export class AssistantController {
  static async chat(req: AuthRequest, res: Response) {
    try {
      const { message, history, lowLatency } = req.body;
      const user = (req as any).user;
      
      if (!message) {
        return res.status(400).json({
          success: false,
          message: "A chat message is required.",
        });
      }

      // Merge user branch info into user object
      const userWithBranch = {
        ...user,
        selectedBranch: (req as any).selectedBranch || "Masulkhana"
      };

      const result = await AssistantService.handleChat(userWithBranch, message, history, {
        lowLatency: !!lowLatency
      });

      res.json({
        success: true,
        reply: result.reply,
      });
    } catch (error: any) {
      console.error("[ASSISTANT_CONTROLLER] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "An unexpected error occurred.",
      });
    }
  }
}
