import { Router } from "express";
import { WhatsAppService } from "../modules/whatsapp/whatsapp.service";
import { ChatStore } from "../modules/chat/chat.store";
import { ChatPersistenceService } from "../modules/chat/chat.persistence.service";
import { profileService } from "../modules/whatsapp/profile.service";
import {
  authenticateToken,
  ensureSessionAccess,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/session/:id/chats",
  authenticateToken,
  requirePermission("chat:view"),
  ensureSessionAccess(["id"]),
  async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (typeof id !== "string") {
      return res.status(400).json({ error: "ID de sessao invalido" });
    }

    const session = WhatsAppService.getSession(id);
    const memoryChats = session ? ChatStore.listChats(id) : [];
    const dbChats = await ChatPersistenceService.listChats(id).catch(() => []);

    const merged = new Map<string, any>();
    for (const chat of dbChats) merged.set(chat.jid, chat);
    for (const chat of memoryChats) {
      const existing = merged.get(chat.jid) || {};
      merged.set(chat.jid, { ...existing, ...chat });
    }

    const chats = Array.from(merged.values()).sort(
      (a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0),
    );

    return res.json({ chats });
  },
);

router.get(
  "/session/:id/contacts/:jid",
  authenticateToken,
  requirePermission("contacts:view"),
  ensureSessionAccess(["id"]),
  async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const rawJid = req.params.jid;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const jid = Array.isArray(rawJid) ? rawJid[0] : rawJid;

    if (typeof id !== "string" || typeof jid !== "string") {
      return res.status(400).json({ error: "Parametros invalidos" });
    }

    const session = WhatsAppService.getSession(id);

    try {
      const resolvedJid = await ChatPersistenceService.resolveChatJid(id, jid);
      const memoryChats = session ? ChatStore.listChats(id) : [];
      const dbChats = await ChatPersistenceService.listChats(id).catch(() => []);
      const allChats = [...memoryChats, ...dbChats];
      const contact = allChats.find((entry) => entry.jid === resolvedJid);

      if (!contact) {
        return res.status(404).json({ error: "Contato nao encontrado" });
      }

      return res.json({
        jid: resolvedJid,
        name: contact.name,
        pushName: contact.name,
        lastSeen: contact.lastTimestamp,
      });
    } catch {
      return res.status(500).json({ error: "Erro ao resolver contato" });
    }
  },
);

router.get(
  "/session/:id/events",
  authenticateToken,
  requirePermission("chat:view"),
  ensureSessionAccess(["id"]),
  (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (typeof id !== "string") {
      return res.status(400).json({ error: "ID de sessao invalido" });
    }

    const session = WhatsAppService.getSession(id);

    if (!session) {
      return res.status(404).json({ error: "Sessao nao encontrada" });
    }

    const limit = Number(req.query.limit || 80);

    return res.json({ events: ChatStore.listEvents(id, limit) });
  },
);

router.get(
  "/session/:id/messages/:jid",
  authenticateToken,
  requirePermission("chat:view"),
  ensureSessionAccess(["id"]),
  async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const rawJid = req.params.jid;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const jid = Array.isArray(rawJid) ? rawJid[0] : rawJid;

    if (typeof id !== "string" || typeof jid !== "string") {
      return res.status(400).json({ error: "Parametros invalidos" });
    }

    const session = WhatsAppService.getSession(id);

    try {
      const resolvedJid = await ChatPersistenceService.resolveChatJid(id, jid);
      const dbMessages = await ChatPersistenceService.getMessages(id, resolvedJid).catch(() => []);
      const memoryMessages = session ? ChatStore.getMessages(id, resolvedJid) : [];

      const merged = new Map<string, any>();
      for (const message of dbMessages) merged.set(message.id, message);
      for (const message of memoryMessages) merged.set(message.id, message);

      const messages = Array.from(merged.values()).sort(
        (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
      );

      ChatStore.markAsRead(id, resolvedJid);
      ChatPersistenceService.markAsRead(id, resolvedJid);

      return res.json({ jid: resolvedJid, messages });
    } catch (error) {
      console.error("Erro ao buscar mensagens:", error);
      return res.status(500).json({ error: "Erro ao buscar mensagens" });
    }
  },
);

router.get(
  "/session/:id/media/:jid/:messageId",
  authenticateToken,
  requirePermission("chat:view"),
  ensureSessionAccess(["id"]),
  async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const rawJid = req.params.jid;
    const rawMessageId = req.params.messageId;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const jid = Array.isArray(rawJid) ? rawJid[0] : rawJid;
    const messageId = Array.isArray(rawMessageId) ? rawMessageId[0] : rawMessageId;

    if (typeof id !== "string" || typeof jid !== "string" || typeof messageId !== "string") {
      return res.status(400).json({ error: "Parametros invalidos" });
    }

    const session = WhatsAppService.getSession(id);

    if (!session) {
      return res.status(404).json({ error: "Sessao nao encontrada" });
    }

    try {
      const media = await WhatsAppService.getMediaContent(id, jid, messageId);

      if (media.expired || media.originalError) {
        return res.json({
          ...media,
          placeholder: true,
          warning: media.originalError,
        });
      }

      return res.json(media);
    } catch (error: any) {
      return res.status(404).json({
        error: error?.message || "Midia nao encontrada",
      });
    }
  },
);

router.post(
  "/session/:id/messages",
  authenticateToken,
  requirePermission("chat:reply"),
  ensureSessionAccess(["id"]),
  async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (typeof id !== "string") {
      return res.status(400).json({ error: "ID de sessao invalido" });
    }

    const session = WhatsAppService.getSession(id);

    if (!session) {
      return res.status(404).json({ error: "Sessao nao encontrada" });
    }

    try {
      const response = await WhatsAppService.sendMessage(id, req.body);
      return res.json(response);
    } catch (error: any) {
      return res.status(400).json({
        error: error?.message || "Erro ao enviar mensagem",
      });
    }
  },
);

router.get(
  "/session/:id/history/:jid",
  authenticateToken,
  requirePermission("chat:view"),
  ensureSessionAccess(["id"]),
  async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const rawJid = req.params.jid;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const jid = Array.isArray(rawJid) ? rawJid[0] : rawJid;
    const limit = Number(req.query.limit || 50);

    if (typeof id !== "string" || typeof jid !== "string") {
      return res.status(400).json({ error: "Parametros invalidos" });
    }

    try {
      const resolvedJid = await ChatPersistenceService.resolveChatJid(id, jid);
      const messages = await ChatPersistenceService.getMessages(id, resolvedJid, {
        limit,
      }).catch(() => []);
      res.json(messages);
    } catch {
      res.status(500).json({ error: "Erro ao buscar historico" });
    }
  },
);

router.get(
  "/session/:id/profile-picture/:jid",
  authenticateToken,
  requirePermission("chat:view"),
  ensureSessionAccess(["id"]),
  async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id;
    const rawJid = req.params.jid;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const jid = Array.isArray(rawJid) ? rawJid[0] : rawJid;

    if (typeof id !== "string" || typeof jid !== "string") {
      return res.status(400).json({ error: "Parametros invalidos" });
    }

    try {
      const cachedUrl = await profileService.getProfilePictureUrl(id, jid);
      if (cachedUrl !== null) {
        return res.json({ profilePictureUrl: cachedUrl });
      }

      const session = WhatsAppService.getSession(id);
      if (!session) {
        return res.status(404).json({ error: "Sessao nao encontrada" });
      }

      profileService.fetchProfilePicture(id, session, jid).catch(() => undefined);

      return res.json({ profilePictureUrl: null });
    } catch (error) {
      console.error("Error fetching profile picture:", error);
      return res.status(500).json({ error: "Erro ao buscar foto de perfil" });
    }
  },
);

export default router;
