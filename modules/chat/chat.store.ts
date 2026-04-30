import { jidNormalizedUser } from "@whiskeysockets/baileys";
import type {
  ChatMessage,
  MessageKind,
  MessageStatus,
  MessageMedia,
  MessageReactionFull,
  MessageInteractive,
  MessageQuote,
  ChatMeta,
  SessionEvent,
  ContactUpdate,
  SessionMessage
} from "../../types/message.types";
import { 
  normalizeJid as normalizeJidUtil,
  normalizeMessageStatus,
  messagePreview
} from "../../utils/message.utils";

type SessionChats = {
  messages: Record<string, ChatMessage[]>;
  meta: Record<string, ChatMeta>;
  aliases: Record<string, string>;
  events: SessionEvent[];
};

const store: Record<string, SessionChats> = {};

function normalizeJid(jid: string): string {
  const normalized = normalizeJidUtil(jid);
  return (
    normalized ||
    String(jid || "")
      .trim()
      .toLowerCase()
  );
}

function ensureSession(sessionId: string): SessionChats {
  if (!store[sessionId]) {
    store[sessionId] = { messages: {}, meta: {}, aliases: {}, events: [] };
  }

  return store[sessionId];
}

function resolveJid(session: SessionChats, jid: string): string {
  const normalized = normalizeJid(jid);
  if (!normalized) {
    return "";
  }

  let current = session.aliases[normalized] || normalized;
  const visited = [normalized];

  while (session.aliases[current] && session.aliases[current] !== current) {
    const next = session.aliases[current];

    if (!next || visited.includes(next)) {
      break;
    }

    visited.push(current);
    current = next;
  }

  for (const alias of visited) {
    session.aliases[alias] = current;
  }

  session.aliases[current] = current;
  return current;
}

function ensureChatByCanonical(session: SessionChats, jid: string) {
  if (!session.messages[jid]) {
    session.messages[jid] = [];
  }

  if (!session.meta[jid]) {
    session.meta[jid] = {
      jid,
      unread: 0,
      lastTimestamp: 0,
      lastMessage: "",
    };
  }

  session.aliases[jid] = jid;

  return {
    messages: session.messages[jid],
    meta: session.meta[jid],
  };
}

function ensureChat(session: SessionChats, jid: string) {
  const canonicalJid = resolveJid(session, jid);

  if (!canonicalJid) {
    return null;
  }

  return {
    jid: canonicalJid,
    ...ensureChatByCanonical(session, canonicalJid),
  };
}

function jidPriority(jid: string): number {
  // Phone JID tem prioridade máxima (é o identificador principal)
  if (jid.endsWith("@s.whatsapp.net")) {
    return 3;
  }

  // LID tem prioridade secundária
  if (jid.endsWith("@lid")) {
    return 2;
  }

  // Outros JIDs (grupos, broadcast, etc.)
  return 1;
}

function isLidJid(jid: string) {
  return jid.endsWith("@lid");
}

function isPhoneJid(jid: string) {
  return jid.endsWith("@s.whatsapp.net");
}

function extractPhoneBase(jid: string): string {
  // Extrai a parte numérica do JID (ex: "5511999999999" de "5511999999999@s.whatsapp.net")
  const match = jid.match(/^(\d+)/);
  return match ? match[1] : jid;
}

function canMergeAliases(firstJid: string, secondJid: string): boolean {
  if (!firstJid || !secondJid || firstJid === secondJid) {
    return true;
  }

  // LID e Phone JID do mesmo contato podem ser unificados
  if (isLidJid(firstJid) && isPhoneJid(secondJid)) {
    return true;
  }

  if (isPhoneJid(firstJid) && isLidJid(secondJid)) {
    return true;
  }

  // Verifica se são o mesmo número com domínios diferentes
  const firstBase = extractPhoneBase(firstJid);
  const secondBase = extractPhoneBase(secondJid);

  if (firstBase === secondBase && firstBase.length >= 10) {
    return true;
  }

  return false;
}

function hasChat(session: SessionChats, jid: string) {
  return !!session.messages[jid] || !!session.meta[jid];
}

function chooseCanonicalJid(session: SessionChats, candidates: string[]) {
  return [...candidates].sort((firstJid, secondJid) => {
    const firstHasChat = hasChat(session, firstJid) ? 1 : 0;
    const secondHasChat = hasChat(session, secondJid) ? 1 : 0;

    if (firstHasChat !== secondHasChat) {
      return secondHasChat - firstHasChat;
    }

    const firstPriority = jidPriority(firstJid);
    const secondPriority = jidPriority(secondJid);

    if (firstPriority !== secondPriority) {
      return secondPriority - firstPriority;
    }

    const firstTimestamp = session.meta[firstJid]?.lastTimestamp || 0;
    const secondTimestamp = session.meta[secondJid]?.lastTimestamp || 0;
    return secondTimestamp - firstTimestamp;
  })[0];
}

function choosePreferredJid(
  session: SessionChats,
  firstJid: string,
  secondJid: string,
) {
  const firstPriority = jidPriority(firstJid);
  const secondPriority = jidPriority(secondJid);

  if (firstPriority !== secondPriority) {
    return firstPriority > secondPriority ? firstJid : secondJid;
  }

  const firstTimestamp = session.meta[firstJid]?.lastTimestamp || 0;
  const secondTimestamp = session.meta[secondJid]?.lastTimestamp || 0;
  return firstTimestamp >= secondTimestamp ? firstJid : secondJid;
}

function mergeChats(
  session: SessionChats,
  targetJid: string,
  sourceJid: string,
): string {
  const resolvedTarget = resolveJid(session, targetJid);
  const resolvedSource = resolveJid(session, sourceJid);

  if (!resolvedTarget) {
    return resolvedSource;
  }

  if (!resolvedSource || resolvedTarget === resolvedSource) {
    return resolvedTarget;
  }

  const target = ensureChatByCanonical(session, resolvedTarget);
  const sourceMessages = session.messages[resolvedSource] || [];
  const sourceMeta = session.meta[resolvedSource];
  const existingIds = new Set(target.messages.map((message) => message.id));

  for (const message of sourceMessages) {
    if (existingIds.has(message.id)) {
      continue;
    }

    target.messages.push({
      ...message,
      jid: resolvedTarget,
    });

    existingIds.add(message.id);
  }

  target.messages.sort((a, b) => a.timestamp - b.timestamp);

  if (sourceMeta) {
    target.meta.unread += sourceMeta.unread;

    if (sourceMeta.lastTimestamp >= target.meta.lastTimestamp) {
      target.meta.lastTimestamp = sourceMeta.lastTimestamp;
      target.meta.lastMessage = sourceMeta.lastMessage;
      target.meta.lastMessageType = sourceMeta.lastMessageType;
    }

    if (!target.meta.name && sourceMeta.name) {
      target.meta.name = sourceMeta.name;
    }
  }

  delete session.messages[resolvedSource];
  delete session.meta[resolvedSource];

  session.aliases[resolvedSource] = resolvedTarget;

  for (const [alias, canonical] of Object.entries(session.aliases)) {
    if (canonical === resolvedSource) {
      session.aliases[alias] = resolvedTarget;
    }
  }

  return resolvedTarget;
}

function nextMessageId(jid: string, timestamp: number) {
  return `${jid}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
}


function mergeMessage(existing: ChatMessage, incoming: Partial<ChatMessage>) {
  if (incoming.text && incoming.text !== existing.text) {
    existing.text = incoming.text;
  }

  if (incoming.timestamp && incoming.timestamp > existing.timestamp) {
    existing.timestamp = incoming.timestamp;
  }

  if (incoming.type && existing.type === "unknown") {
    existing.type = incoming.type;
  }

  if (incoming.status) {
    existing.status = incoming.status;
  }

  if (incoming.rawType) {
    existing.rawType = incoming.rawType;
  }

  if (incoming.name) {
    existing.name = incoming.name;
  }

  if (incoming.participant) {
    existing.participant = incoming.participant;
  }

  if (incoming.isEdited) {
    existing.isEdited = true;
  }

  if (incoming.isDeleted) {
    existing.isDeleted = true;
    existing.text = "[Mensagem apagada]";
    existing.type = "system";
  }

  if (incoming.media) {
    existing.media = {
      ...existing.media,
      ...incoming.media,
    };
  }

  if (incoming.interactive) {
    existing.interactive = {
      ...existing.interactive,
      ...incoming.interactive,
    };
  }

  if (incoming.quoted) {
    existing.quoted = {
      ...existing.quoted,
      ...incoming.quoted,
    };
  }

  if (incoming.reaction) {
    existing.reaction = {
      ...existing.reaction,
      ...incoming.reaction,
    };
  }

  if (incoming.raw) {
    existing.raw = incoming.raw;
  }
}

function shouldCreateChatForMessage(message: SessionMessage): boolean {
  // Não cria chats para mensagens de sistema
  if (message.type === "system" || message.type === "unknown") {
    return false;
  }
  
  // Não cria chats para status broadcast
  if (message.jid === "status@broadcast") {
    return false;
  }
  
  // Não cria chats para mensagens vazias sem conteúdo
  if (!message.text && !message.media && !message.interactive && !message.quoted) {
    return false;
  }
  
  return true;
}

function upsertMessage(
  sessionId: string,
  payload: {
    id?: string;
    jid: string;
    text?: string;
    fromMe: boolean;
    timestamp?: number;
    type?: MessageKind;
    status?: MessageStatus | number | string;
    rawType?: string;
    name?: string;
    participant?: string;
    media?: MessageMedia;
    reaction?: {
      targetId?: string;
      emoji?: string;
    };
    interactive?: MessageInteractive;
    quoted?: MessageQuote;
    isEdited?: boolean;
    isDeleted?: boolean;
    raw?: any;
  },
  options: { countUnread?: boolean } = {},
) {
  // Valida se a mensagem deve criar um chat
  const messageObj: SessionMessage = {
    ...payload,
    timestamp: payload.timestamp || Date.now(),
    status: payload.status ? normalizeMessageStatus(payload.status as number | string | null) : undefined,
  };
  
  if (!shouldCreateChatForMessage(messageObj)) {
    return;
  }

  const session = ensureSession(sessionId);
  const chat = ensureChat(session, payload.jid);

  if (!chat) {
    return;
  }

  const normalizedTimestamp = Number.isFinite(payload.timestamp)
    ? Number(payload.timestamp)
    : Date.now();
  const id = payload.id || nextMessageId(chat.jid, normalizedTimestamp);
  const existing = chat.messages.find((message) => message.id === id);
  const nextType = payload.type || "unknown";
  const normalizedStatus = normalizeMessageStatus(
    payload.status as number | string | null,
  );

  if (existing) {
    mergeMessage(existing, {
      text: payload.text,
      timestamp: normalizedTimestamp,
      type: nextType,
      status:
        normalizedStatus === "unknown" ? existing.status : normalizedStatus,
      rawType: payload.rawType,
      name: payload.name,
      participant: payload.participant,
      media: payload.media,
      reaction: payload.reaction,
      interactive: payload.interactive,
      quoted: payload.quoted,
      isEdited: payload.isEdited,
      isDeleted: payload.isDeleted,
      raw: payload.raw,
    });
  } else {
    chat.messages.push({
      id,
      jid: chat.jid,
      text: payload.isDeleted ? "[Mensagem apagada]" : payload.text || "",
      direction: payload.fromMe ? "outbound" : "inbound",
      fromMe: payload.fromMe,
      timestamp: normalizedTimestamp,
      type: payload.isDeleted ? "system" : nextType,
      status: normalizedStatus,
      rawType: payload.rawType,
      name: payload.name,
      participant: payload.participant,
      isEdited: payload.isEdited,
      isDeleted: payload.isDeleted,
      media: payload.media,
      reaction: payload.reaction,
      interactive: payload.interactive,
      quoted: payload.quoted,
      raw: payload.raw,
      reactions: [],
    });
  }

  chat.messages.sort((a, b) => a.timestamp - b.timestamp);

  const currentMessage = chat.messages.find((message) => message.id === id);
  if (!currentMessage) {
    return;
  }

  if (!payload.fromMe && options.countUnread !== false) {
    chat.meta.unread += 1;
  }

  if (normalizedTimestamp >= chat.meta.lastTimestamp) {
    chat.meta.lastTimestamp = normalizedTimestamp;
    chat.meta.lastMessage = messagePreview(currentMessage);
    chat.meta.lastMessageType = currentMessage.type;
  }

  // Lógica conservadora para atualizar nome: só sobrescreve se não existir ou for numérico
  // NÃO atualiza nome de grupos com nome de participantes (evita que grupo fique com nome de quem enviou msg)
  const isGroupChat = chat.jid.endsWith("@g.us");
  const normalizedName = payload.name?.trim();
  if (normalizedName && !isGroupChat) {
    const currentName = chat.meta.name;
    if (!currentName || currentName.match(/^\d+$/) || (normalizedName.length > currentName.length && !normalizedName.match(/^\d+$/))) {
      chat.meta.name = normalizedName;
    }
  }
}

function findMessage(session: SessionChats, jid: string, messageId: string) {
  const chat = ensureChat(session, jid);

  if (!chat) {
    return undefined;
  }

  return chat.messages.find((message) => message.id === messageId);
}

function addSessionEvent(session: SessionChats, name: string, summary: string) {
  session.events.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    timestamp: Date.now(),
    summary,
  });

  if (session.events.length > 250) {
    session.events.length = 250;
  }
}

export class ChatStore {
  static addEvent(sessionId: string, name: string, summary: string) {
    const session = ensureSession(sessionId);
    addSessionEvent(session, name, summary);
  }

  static listEvents(sessionId: string, limit = 80) {
    const session = ensureSession(sessionId);
    const normalizedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(250, Math.floor(limit)))
      : 80;
    return session.events.slice(0, normalizedLimit);
  }

  static upsertContact(
    sessionId: string,
    payload: {
      id?: string;
      jid?: string;
      lid?: string;
      name?: string;
      notify?: string;
      verifiedName?: string;
    },
  ) {
    const session = ensureSession(sessionId);

    // Coleta todos os JIDs candidatos e normaliza
    const rawCandidates = [payload.jid, payload.id, payload.lid].filter(
      Boolean,
    ) as string[];
    const normalizedCandidates = rawCandidates
      .map((value) => normalizeJid(value))
      .filter((value, index, all) => !!value && all.indexOf(value) === index);

    if (!normalizedCandidates.length) {
      return;
    }

    // Resolve aliases existentes para encontrar o JID canônico atual
    const resolvedCandidates = Array.from(
      new Set(
        normalizedCandidates
          .map((jid) => resolveJid(session, jid))
          .filter((jid) => !!jid),
      ),
    );

    // Seleciona o JID canônico preferido (prioriza phone JID e chats existentes)
    let canonicalJid = chooseCanonicalJid(session, resolvedCandidates);

    if (!canonicalJid) {
      // Fallback: usa o primeiro candidato normalizado
      canonicalJid = normalizedCandidates[0];
      session.aliases[canonicalJid] = canonicalJid;
    }

    // Unifica todos os aliases sob o mesmo JID canônico
    for (const candidate of normalizedCandidates) {
      if (candidate === canonicalJid) {
        continue;
      }

      // Verifica se pode unificar (LID com Phone JID do mesmo número)
      if (!canMergeAliases(canonicalJid, candidate)) {
        // Mantém separado se não puder unificar
        session.aliases[candidate] = candidate;
        continue;
      }

      // Se ambos têm chats, faz o merge
      if (hasChat(session, canonicalJid) && hasChat(session, candidate)) {
        canonicalJid = mergeChats(session, canonicalJid, candidate);
      } else if (hasChat(session, candidate)) {
        // Move o chat existente para o canônico
        canonicalJid = mergeChats(session, candidate, canonicalJid);
      } else {
        // Apenas cria o alias
        session.aliases[candidate] = canonicalJid;
      }
    }

    // Garante que todos os aliases apontem para o canônico
    for (const candidate of normalizedCandidates) {
      session.aliases[candidate] = canonicalJid;
    }

    // Seleciona o nome preferido (prioriza: name > notify > verifiedName)
    const preferredName = [payload.name, payload.notify, payload.verifiedName]
      .map((value) => value?.trim())
      .find((value) => !!value && value.length > 0 && !value.match(/^\d+$/));

    if (!preferredName) {
      return;
    }

    // Atualiza o nome em todos os JIDs relacionados com lógica conservadora
    const allRelatedJids = new Set([canonicalJid, ...normalizedCandidates]);
    for (const relatedJid of allRelatedJids) {
      const resolved = resolveJid(session, relatedJid);
      if (resolved && session.meta[resolved]) {
        const currentName = session.meta[resolved].name;
        // NÃO sobrescreve nome de grupos com nome de participantes
        const isGroupChat = resolved.endsWith("@g.us");
        if (isGroupChat && currentName && !currentName.match(/^\d+$/)) {
          continue; // Mantém nome existente do grupo
        }
        
        // Prioriza nomes não vazios e mais descritivos, mas só sobrescreve se for melhor
        if (
          !currentName ||
          currentName.match(/^\d+$/) ||
          (preferredName.length > currentName.length && !preferredName.match(/^\d+$/))
        ) {
          session.meta[resolved].name = preferredName;
        }
      }
    }
  }

  static addIncoming(
    sessionId: string,
    payload: {
      id?: string;
      jid: string;
      text?: string;
      timestamp?: number;
      name?: string;
      participant?: string;
      type?: MessageKind;
      media?: MessageMedia;
      reaction?: {
        targetId?: string;
        emoji?: string;
      };
      interactive?: MessageInteractive;
      quoted?: MessageQuote;
      status?: MessageStatus | number | string;
      rawType?: string;
      isEdited?: boolean;
      isDeleted?: boolean;
      raw?: any;
    },
  ) {
    upsertMessage(
      sessionId,
      {
        ...payload,
        fromMe: false,
      },
      { countUnread: true },
    );
  }

  static addOutgoing(
    sessionId: string,
    payload: {
      id?: string;
      jid: string;
      text?: string;
      timestamp?: number;
      name?: string;
      participant?: string;
      type?: MessageKind;
      media?: MessageMedia;
      reaction?: {
        targetId?: string;
        emoji?: string;
      };
      interactive?: MessageInteractive;
      quoted?: MessageQuote;
      status?: MessageStatus | number | string;
      rawType?: string;
      isEdited?: boolean;
      isDeleted?: boolean;
      raw?: any;
    },
  ) {
    upsertMessage(
      sessionId,
      {
        ...payload,
        fromMe: true,
      },
      { countUnread: false },
    );
  }

  static addHistory(
    sessionId: string,
    payload: {
      id?: string;
      jid: string;
      text?: string;
      fromMe: boolean;
      timestamp: number;
      name?: string;
      participant?: string;
      type?: MessageKind;
      media?: MessageMedia;
      reaction?: {
        targetId?: string;
        emoji?: string;
      };
      interactive?: MessageInteractive;
      quoted?: MessageQuote;
      status?: MessageStatus | number | string;
      rawType?: string;
      isEdited?: boolean;
      isDeleted?: boolean;
      raw?: any;
    },
  ) {
    // Usa a mesma função upsertMessage para histórico, garantindo consistência
    upsertMessage(sessionId, payload, { countUnread: false });
  }

  static updateMessage(
    sessionId: string,
    payload: {
      id: string;
      jid: string;
      text?: string;
      timestamp?: number;
      status?: MessageStatus | number | string;
      type?: MessageKind;
      rawType?: string;
      media?: MessageMedia;
      interactive?: MessageInteractive;
      quoted?: MessageQuote;
      isEdited?: boolean;
      isDeleted?: boolean;
      participant?: string;
      name?: string;
    },
  ) {
    const session = ensureSession(sessionId);
    const message = findMessage(session, payload.jid, payload.id);

    if (!message) {
      // Não cria mensagens novas para updates de status/receipt
      // Apenas atualiza se a mensagem já existir
      return;
    }

    mergeMessage(message, {
      text: payload.text,
      timestamp: payload.timestamp,
      status: normalizeMessageStatus(payload.status as number | string | null),
      type: payload.type,
      rawType: payload.rawType,
      media: payload.media,
      interactive: payload.interactive,
      quoted: payload.quoted,
      isEdited: payload.isEdited,
      isDeleted: payload.isDeleted,
      participant: payload.participant,
      name: payload.name,
    });

    const chat = ensureChat(session, payload.jid);
    if (!chat) {
      return;
    }

    if (message.timestamp >= chat.meta.lastTimestamp) {
      chat.meta.lastTimestamp = message.timestamp;
      chat.meta.lastMessage = messagePreview(message);
      chat.meta.lastMessageType = message.type;
    }
  }

  static applyReaction(
    sessionId: string,
    payload: {
      jid: string;
      messageId: string;
      emoji?: string;
      actor?: string;
      fromMe?: boolean;
      timestamp?: number;
    },
  ) {
    const session = ensureSession(sessionId);
    const target = findMessage(session, payload.jid, payload.messageId);

    if (!target) {
      return;
    }

    if (!target.reactions) {
      target.reactions = [];
    }

    const actorKey = payload.actor || (payload.fromMe ? "me" : "unknown");
    const existingIndex = target.reactions.findIndex(
      (reaction) => (reaction.actor || "unknown") === actorKey,
    );

    if (!payload.emoji) {
      if (existingIndex >= 0) {
        target.reactions.splice(existingIndex, 1);
      }
      return;
    }

    const nextReaction: MessageReactionFull = {
      emoji: payload.emoji,
      actor: payload.actor,
      fromMe: payload.fromMe,
      timestamp: payload.timestamp,
    };

    if (existingIndex >= 0) {
      target.reactions[existingIndex] = nextReaction;
    } else {
      target.reactions.push(nextReaction);
    }
  }

  static markMessageDeleted(
    sessionId: string,
    jid: string,
    messageId: string,
    timestamp = Date.now(),
  ) {
    this.updateMessage(sessionId, {
      id: messageId,
      jid,
      timestamp,
      isDeleted: true,
      type: "system",
      text: "[Mensagem apagada]",
    });
  }

  static upsertHistoryChat(
    sessionId: string,
    payload: {
      jid: string;
      name?: string;
      unread?: number;
      lastTimestamp?: number;
      lastMessage?: string;
      lastMessageType?: MessageKind;
    },
  ) {
    const session = ensureSession(sessionId);
    const chat = ensureChat(session, payload.jid);

    if (!chat) {
      return;
    }

    // Lógica conservadora para atualizar nome: só sobrescreve se não existir ou for numérico
  // NÃO atualiza nome de grupos com nome de participantes (evita que grupo fique com nome de quem enviou msg)
  const isGroupChat = chat.jid.endsWith("@g.us");
  const normalizedName = payload.name?.trim();
  if (normalizedName && !isGroupChat) {
    const currentName = chat.meta.name;
    if (!currentName || currentName.match(/^\d+$/) || (normalizedName.length > currentName.length && !normalizedName.match(/^\d+$/))) {
      chat.meta.name = normalizedName;
    }
  }

    const normalizedUnread = Number(payload.unread);
    if (Number.isFinite(normalizedUnread) && normalizedUnread >= 0) {
      chat.meta.unread = Math.max(
        chat.meta.unread,
        Math.floor(normalizedUnread),
      );
    }

    const normalizedTimestamp = Number(payload.lastTimestamp);
    if (
      Number.isFinite(normalizedTimestamp) &&
      normalizedTimestamp > chat.meta.lastTimestamp
    ) {
      chat.meta.lastTimestamp = normalizedTimestamp;
    }

    const normalizedLastMessage = payload.lastMessage?.trim();
    if (normalizedLastMessage) {
      chat.meta.lastMessage = normalizedLastMessage;
    }

    if (payload.lastMessageType) {
      chat.meta.lastMessageType = payload.lastMessageType;
    }
  }

  static resolveChatJid(sessionId: string, jid: string) {
    const session = ensureSession(sessionId);
    return resolveJid(session, jid);
  }

  static listChats(sessionId: string) {
    const session = ensureSession(sessionId);
    return Object.values(session.meta)
      .map((chat) => ({ ...chat }))
      .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }

  static getMessage(sessionId: string, jid: string, messageId: string) {
    const session = ensureSession(sessionId);
    const message = findMessage(session, jid, messageId);
    return message ? { ...message } : undefined;
  }

  static getMessages(sessionId: string, jid: string) {
    const session = ensureSession(sessionId);
    const chat = ensureChat(session, jid);

    if (!chat) {
      return [];
    }

    return [...chat.messages].sort((a, b) => a.timestamp - b.timestamp);
  }

  static markAsRead(sessionId: string, jid: string) {
    const session = ensureSession(sessionId);
    const chat = ensureChat(session, jid);

    if (!chat) {
      return;
    }

    chat.meta.unread = 0;
  }

  static setProfilePictureUrl(sessionId: string, jid: string, url: string | null): void {
    const session = ensureSession(sessionId);
    const chat = ensureChat(session, jid);

    if (!chat) {
      return;
    }

    // Só atualiza se for diferente
    if (chat.meta.profilePictureUrl !== url) {
      chat.meta.profilePictureUrl = url || undefined;
    }
  }

  static getProfilePictureUrl(sessionId: string, jid: string): string | null {
    const session = ensureSession(sessionId);
    const chat = ensureChat(session, jid);

    if (!chat) {
      return null;
    }

    return chat.meta.profilePictureUrl || null;
  }

  static updateProfilePictureUrl(sessionId: string, jid: string, url: string | null): void {
    this.setProfilePictureUrl(sessionId, jid, url);
  }
}
