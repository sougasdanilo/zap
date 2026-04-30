import { Router } from "express";
import { WhatsAppService } from "../modules/whatsapp/whatsapp.service";
import { ChatStore } from "../modules/chat/chat.store";
import { ChatPersistenceService } from "../modules/chat/chat.persistence.service";
import { profileService } from "../modules/whatsapp/profile.service";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.middleware";

const router = Router();

// LISTAR CHATS
router.get("/session/:id/chats", authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: "ID de sessão inválido" });
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
});

// INFORMACOES DO CONTATO
router.get("/session/:id/contacts/:jid", authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id, jid } = req.params;

  if (typeof id !== 'string' || typeof jid !== 'string') {
    return res.status(400).json({ error: "Parâmetros inválidos" });
  }

  const session = WhatsAppService.getSession(id);

  try {
    const resolvedJid = await ChatPersistenceService.resolveChatJid(id, jid);
    const memoryChats = session ? ChatStore.listChats(id) : [];
    const dbChats = await ChatPersistenceService.listChats(id).catch(() => []);
    const allChats = [...memoryChats, ...dbChats];
    const contact = allChats.find((c) => c.jid === resolvedJid);

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
});

// EVENTOS DA SESSÃO
router.get("/session/:id/events", (req, res) => {
  const { id } = req.params;
  const session = WhatsAppService.getSession(id);

  if (!session) {
    return res.status(404).json({ error: "Sessao nao encontrada" });
  }

  const limit = Number(req.query.limit || 80);

  return res.json({ events: ChatStore.listEvents(id, limit) });
});

// HISTÓRICO DE MENSAGENS DO CHAT
router.get("/session/:id/messages/:jid", async (req, res) => {
  const { id, jid } = req.params;
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
  } catch (error: any) {
    console.error("Erro ao buscar mensagens:", error);
    return res.status(500).json({ error: "Erro ao buscar mensagens" });
  }
});

// BAIXAR MIDIA
router.get("/session/:id/media/:jid/:messageId", async (req, res) => {
  const { id, jid, messageId } = req.params;
  const session = WhatsAppService.getSession(id);

  if (!session) {
    return res.status(404).json({ error: "Sessao nao encontrada" });
  }

  try {
    const media = await WhatsAppService.getMediaContent(id, jid, messageId);
    
    // If media is a placeholder (expired or inaccessible), include metadata
    if (media.expired || media.originalError) {
      return res.json({
        ...media,
        placeholder: true,
        warning: media.originalError
      });
    }
    
    return res.json(media);
  } catch (error: any) {
    return res.status(404).json({
      error: error?.message || "Midia nao encontrada",
    });
  }
});

// ENVIAR MENSAGEM
router.post("/session/:id/messages", async (req, res) => {
  const { id } = req.params;
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
});

// HISTÓRICO COM LIMITE
router.get("/session/:id/history/:jid", async (req, res) => {
  const { id, jid } = req.params;
  const limit = Number(req.query.limit || 50);

  try {
    const resolvedJid = await ChatPersistenceService.resolveChatJid(id, jid);
    const messages = await ChatPersistenceService.getMessages(id, resolvedJid, { limit }).catch(() => []);
    res.json(messages);
  } catch {
    res.status(500).json({ error: "Erro ao buscar histórico" });
  }
});

// OBTER FOTO DE PERFIL
router.get("/session/:id/profile-picture/:jid", authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id, jid } = req.params;

  if (typeof id !== 'string' || typeof jid !== 'string') {
    return res.status(400).json({ error: "Parâmetros inválidos" });
  }

  try {
    // Verifica cache primeiro
    const cachedUrl = await profileService.getProfilePictureUrl(id, jid);
    if (cachedUrl !== null) {
      return res.json({ profilePictureUrl: cachedUrl });
    }

    // Se não tiver cache, busca do WhatsApp
    const session = WhatsAppService.getSession(id);
    if (!session) {
      return res.status(404).json({ error: "Sessão não encontrada" });
    }

    // Busca em background sem bloquear
    profileService.fetchProfilePicture(id, session, jid).catch(() => {
      // Ignora erros, é apenas background loading
    });

    // Retorna null por enquanto (carregando)
    return res.json({ profilePictureUrl: null });
  } catch (error) {
    console.error('Error fetching profile picture:', error);
    return res.status(500).json({ error: "Erro ao buscar foto de perfil" });
  }
});

export default router;
