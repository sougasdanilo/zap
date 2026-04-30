import { Router } from "express";
import { existsSync } from "fs";
import path from "path";
import { WhatsAppService } from "../modules/whatsapp/whatsapp.service";
import {
  authenticateToken,
  ensureSessionAccess,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const router = Router();

router.post(
  "/session/:id",
  authenticateToken,
  requirePermission("chat:view"),
  ensureSessionAccess(["id"]),
  async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (typeof id !== "string") {
      return res.status(400).json({ error: "ID de sessao invalido" });
    }

    await WhatsAppService.initSession(id);

    res.json({
      message: `Sessao ${id} iniciada`,
      state: WhatsAppService.getSessionState(id),
    });
  },
);

router.get(
  "/sessions",
  authenticateToken,
  requirePermission("chat:view"),
  (req: AuthenticatedRequest, res) => {
    const sessionId = req.user?.sessionId;

    if (!sessionId) {
      return res.status(401).json({ error: "Usuario nao autenticado" });
    }

    const authDir = path.resolve("auth", sessionId);

    res.json({
      active: WhatsAppService.listSessions().includes(sessionId) ? [sessionId] : [],
      stored: existsSync(authDir) ? [sessionId] : [],
    });
  },
);

router.get(
  "/session/:id/status",
  authenticateToken,
  requirePermission("chat:view"),
  ensureSessionAccess(["id"]),
  (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (typeof id !== "string") {
      return res.status(400).json({ error: "ID de sessao invalido" });
    }

    res.json({
      id,
      state: WhatsAppService.getSessionState(id),
    });
  },
);

router.delete(
  "/session/:id",
  authenticateToken,
  requirePermission("tenant:manage"),
  ensureSessionAccess(["id"]),
  async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { deleteCredentials } = req.query;

    if (typeof id !== "string") {
      return res.status(400).json({ error: "ID de sessao invalido" });
    }

    await WhatsAppService.closeSession(id, deleteCredentials === "true");

    res.json({
      message:
        deleteCredentials === "true"
          ? `Sessao ${id} encerrada e credenciais excluidas`
          : `Sessao ${id} encerrada`,
    });
  },
);

router.delete(
  "/session/:id/credentials",
  authenticateToken,
  requirePermission("tenant:manage"),
  ensureSessionAccess(["id"]),
  async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (typeof id !== "string") {
      return res.status(400).json({ error: "ID de sessao invalido" });
    }

    await WhatsAppService.deleteSessionCredentials(id);

    res.json({ message: `Credenciais da sessao ${id} excluidas` });
  },
);

export default router;
