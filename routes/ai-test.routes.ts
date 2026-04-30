import { Router } from "express";
import { LLMService } from "../modules/llm/llm.service";
import {
  authenticateToken,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const router = Router();

router.post(
  "/test-conversation",
  authenticateToken,
  requirePermission("ai:manage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      const response = await LLMService.ask(messages, {
        tenantId: req.user?.tenantId,
      });
      res.json({ response });
    } catch (error: any) {
      console.error("Error in AI test:", error);
      res.status(500).json({
        error: error.message || "Erro ao processar mensagem com IA",
      });
    }
  },
);

export default router;
