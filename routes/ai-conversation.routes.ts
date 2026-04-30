import { Router } from "express";
import { AIConversationService } from "../modules/ai/ai.conversation.service";
import {
  authenticateToken,
  ensureSessionAccess,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/status/:sessionId",
  authenticateToken,
  requirePermission("chat:view"),
  ensureSessionAccess(["sessionId"]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const rawSessionId = req.params.sessionId;
      const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
      if (typeof sessionId !== "string") {
        return res.status(400).json({ error: "Sessao invalida" });
      }

      const status = await AIConversationService.getAIStatus(sessionId);
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Erro ao obter status da IA" });
    }
  },
);

router.post(
  "/toggle/:sessionId",
  authenticateToken,
  requirePermission("ai:manage"),
  ensureSessionAccess(["sessionId"]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const rawSessionId = req.params.sessionId;
      const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
      if (typeof sessionId !== "string") {
        return res.status(400).json({ error: "Sessao invalida" });
      }

      const status = await AIConversationService.toggleAI(sessionId);

      const message = status.enabled
        ? "IA habilitada com sucesso! O bot respondera automaticamente as mensagens."
        : "IA desabilitada. O bot nao respondera automaticamente.";

      res.json({
        ...status,
        message,
      });
    } catch (error) {
      res.status(500).json({ error: "Erro ao alterar status da IA" });
    }
  },
);

router.post(
  "/enable/:sessionId",
  authenticateToken,
  requirePermission("ai:manage"),
  ensureSessionAccess(["sessionId"]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const rawSessionId = req.params.sessionId;
      const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
      if (typeof sessionId !== "string") {
        return res.status(400).json({ error: "Sessao invalida" });
      }

      await AIConversationService.enableAI(sessionId);
      res.json({
        enabled: true,
        message: "IA habilitada com sucesso! O bot respondera automaticamente as mensagens.",
      });
    } catch (error) {
      res.status(500).json({ error: "Erro ao habilitar IA" });
    }
  },
);

router.post(
  "/disable/:sessionId",
  authenticateToken,
  requirePermission("ai:manage"),
  ensureSessionAccess(["sessionId"]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const rawSessionId = req.params.sessionId;
      const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
      if (typeof sessionId !== "string") {
        return res.status(400).json({ error: "Sessao invalida" });
      }

      await AIConversationService.disableAI(sessionId);
      res.json({
        enabled: false,
        message: "IA desabilitada. O bot nao respondera automaticamente.",
      });
    } catch (error) {
      res.status(500).json({ error: "Erro ao desabilitar IA" });
    }
  },
);

export default router;
