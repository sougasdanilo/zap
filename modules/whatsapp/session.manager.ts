import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { Boom } from "@hapi/boom";
import type { 
  SessionMessage, 
  ContactUpdate, 
  CreateSessionOptions 
} from "../../types/message.types";
import { 
  normalizeTimestamp, 
  normalizeJid, 
  pickContactName 
} from "../../utils/message.utils";
import { parseMessagePayload, parseMessagePayloadWithSession } from "../../utils/message.parser";

// Repositório central de nomes por sessão
const contactNamesBySession = new Map<string, Map<string, string>>();

// Disponibiliza globalmente para outras modules
(globalThis as any).contactNamesBySession = contactNamesBySession;

function getContactName(sessionId: string, jid: string, fallbackName?: string): string | undefined {
  const sessionNames = contactNamesBySession.get(sessionId);
  if (!sessionNames) {
    return fallbackName;
  }
  
  return sessionNames.get(jid) || fallbackName;
}

function setContactName(sessionId: string, jid: string, name: string): void {
  if (!name || name.trim().length === 0) {
    return;
  }
  
  if (!contactNamesBySession.has(sessionId)) {
    contactNamesBySession.set(sessionId, new Map());
  }
  
  const sessionNames = contactNamesBySession.get(sessionId)!;
  const normalizedName = name.trim();
  
  // Só atualiza se o nome atual for numérico ou não existir
  const currentName = sessionNames.get(jid);
  if (!currentName || currentName.match(/^\d+$/) || normalizedName.length > currentName.length) {
    sessionNames.set(jid, normalizedName);
  }
}


function emitContactUpdate(
  options: CreateSessionOptions,
  payload: {
    id?: string | null;
    jid?: string | null;
    lid?: string | null;
    name?: string | null;
    notify?: string | null;
    verifiedName?: string | null;
  },
) {
  const contact: ContactUpdate = {
    id: normalizeJid(payload.id) || undefined,
    jid: normalizeJid(payload.jid) || undefined,
    lid: normalizeJid(payload.lid) || undefined,
    name: payload.name?.trim() || undefined,
    notify: payload.notify?.trim() || undefined,
    verifiedName: payload.verifiedName?.trim() || undefined,
  };

  // Filtra campos vazios e garante pelo menos um identificador válido
  const hasIdentifier = !!(contact.id || contact.jid || contact.lid);
  const hasNameUpdate = !!(
    contact.name ||
    contact.notify ||
    contact.verifiedName
  );

  if (!hasIdentifier || !hasNameUpdate) {
    return;
  }

  options.onContactUpdate?.(contact);
}

function emitChatSnapshot(
  options: CreateSessionOptions,
  payload: {
    id?: string | null;
    name?: string | null;
    unreadCount?: number | string | null;
    conversationTimestamp?: number | string | { toNumber: () => number } | null;
    lastMessageRecvTimestamp?:
      | number
      | string
      | { toNumber: () => number }
      | null;
  },
  sessionId?: string,
) {
  const jid = normalizeJid(payload.id);

  if (!jid || jid === "status@broadcast") {
    return;
  }

  const unreadValue = Number(payload.unreadCount || 0);
  const normalizedUnread =
    Number.isFinite(unreadValue) && unreadValue >= 0
      ? Math.floor(unreadValue)
      : 0;
  const conversationTs = normalizeTimestamp(payload.conversationTimestamp);
  const recvTs = normalizeTimestamp(payload.lastMessageRecvTimestamp);

  // Usa repositório central de nomes se sessionId for fornecido
  let contactName = payload.name?.trim();
  if (sessionId && !contactName) {
    contactName = getContactName(sessionId, jid);
  }

  options.onHistoryChat?.({
    jid,
    name: contactName,
    unread: normalizedUnread,
    lastTimestamp: conversationTs || recvTs,
  });
}

function receiptStatus(
  receipt: any,
): "server_ack" | "delivery_ack" | "read" | "played" {
  if (receipt?.playedTimestamp || receipt?.playedTimestampMs) {
    return "played";
  }

  if (receipt?.readTimestamp || receipt?.readTimestampMs) {
    return "read";
  }

  if (receipt?.receiptTimestamp || receipt?.receiptTimestampMs) {
    return "delivery_ack";
  }

  return "server_ack";
}

function emitEvent(
  options: CreateSessionOptions,
  name: string,
  summary: string,
) {
  options.onEvent?.({ name, summary });
}

export async function createSession(
  sessionId: string,
  options: CreateSessionOptions = {},
) {
  const { state, saveCreds } = await useMultiFileAuthState(`auth/${sessionId}`);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    emitEvent(
      options,
      "messages.upsert",
      `Mensagens ${type}: ${messages?.length || 0}`,
    );

    for (const incoming of messages || []) {
      const jid = normalizeJid(incoming?.key?.remoteJid) || "";
      const parsed = parseMessagePayloadWithSession(incoming, sessionId);

      if (!parsed) {
        continue;
      }

      // Atualiza repositório de nomes com pushName da mensagem
      if (parsed.name && parsed.name.trim().length > 0) {
        setContactName(sessionId, parsed.jid, parsed.name);
      }

      if (parsed.type === "reaction" && parsed.targetMessageId) {
        options.onReaction?.({
          jid: parsed.jid,
          messageId: parsed.targetMessageId,
          emoji: parsed.reaction?.emoji,
          actor: parsed.participant || parsed.jid,
          fromMe: parsed.fromMe,
          timestamp: parsed.timestamp,
        });
        continue;
      }

      if (parsed.isDeleted && parsed.targetMessageId) {
        options.onMessageDelete?.({
          jid: parsed.jid,
          messageId: parsed.targetMessageId,
          timestamp: parsed.timestamp,
        });
        continue;
      }

      options.onIncomingMessage?.(parsed);
    }
  });

  sock.ev.on("messages.update", (updates) => {
    emitEvent(
      options,
      "messages.update",
      `Atualizacoes de mensagem: ${updates?.length || 0}`,
    );

    for (const item of updates || []) {
      const jid = normalizeJid(item?.key?.remoteJid);
      const id = item?.key?.id;

      if (!jid || !id) {
        continue;
      }

      if (item.update?.status !== undefined) {
        options.onMessageUpdate?.({
          id,
          jid,
          status: Number(item.update.status),
        });
      }

      if (!item.update?.message) {
        continue;
      }

      const parsed = parseMessagePayload({
        key: item.key,
        message: item.update.message,
        messageTimestamp: item.update.messageTimestamp,
        pushName: undefined,
      });

      if (!parsed) {
        continue;
      }

      if (parsed.type === "reaction" && parsed.targetMessageId) {
        options.onReaction?.({
          jid,
          messageId: parsed.targetMessageId,
          emoji: parsed.reaction?.emoji,
          actor: parsed.participant,
          fromMe: parsed.fromMe,
          timestamp: parsed.timestamp,
        });
        continue;
      }

      if (parsed.isDeleted && parsed.targetMessageId) {
        options.onMessageDelete?.({
          jid,
          messageId: parsed.targetMessageId,
          timestamp: parsed.timestamp,
        });
        continue;
      }

      options.onMessageUpdate?.({
        id: parsed.targetMessageId || id,
        jid,
        text: parsed.text,
        timestamp: parsed.timestamp,
        status:
          item.update?.status !== undefined
            ? Number(item.update.status)
            : undefined,
        type: parsed.type,
        rawType: parsed.rawType,
        media: parsed.media,
        interactive: parsed.interactive,
        quoted: parsed.quoted,
        isEdited: parsed.isEdited,
        isDeleted: parsed.isDeleted,
        participant: parsed.participant,
        name: parsed.name,
      });
    }
  });

  sock.ev.on("messages.delete", (event) => {
    if ("keys" in event && Array.isArray(event.keys)) {
      emitEvent(
        options,
        "messages.delete",
        `Mensagens apagadas: ${event.keys.length}`,
      );

      for (const key of event.keys) {
        const jid = normalizeJid(key?.remoteJid);
        const id = key?.id;

        if (!jid || !id) {
          continue;
        }

        options.onMessageDelete?.({
          jid,
          messageId: id,
          timestamp: Date.now(),
        });
      }

      return;
    }

    if ("jid" in event) {
      emitEvent(
        options,
        "messages.delete",
        `Todas as mensagens apagadas no chat ${event.jid}`,
      );
    }
  });

  sock.ev.on("messages.reaction", (events) => {
    emitEvent(options, "messages.reaction", `Reacoes: ${events?.length || 0}`);

    for (const reactionEvent of events || []) {
      const jid = normalizeJid(reactionEvent?.key?.remoteJid);
      const messageId = reactionEvent?.key?.id;

      if (!jid || !messageId) {
        continue;
      }

      options.onReaction?.({
        jid,
        messageId,
        emoji: reactionEvent?.reaction?.text || undefined,
        actor:
          normalizeJid(reactionEvent?.reaction?.key?.participant) || undefined,
        fromMe: !!reactionEvent?.reaction?.key?.fromMe,
        timestamp: normalizeTimestamp(
          reactionEvent?.reaction?.senderTimestampMs,
        ),
      });
    }
  });

  sock.ev.on("message-receipt.update", (events) => {
    emitEvent(
      options,
      "message-receipt.update",
      `Receipts: ${events?.length || 0}`,
    );

    for (const receiptEvent of events || []) {
      const jid = normalizeJid(receiptEvent?.key?.remoteJid);
      const messageId = receiptEvent?.key?.id;

      if (!jid || !messageId) {
        continue;
      }

      options.onMessageReceipt?.({
        jid,
        messageId,
        participant: normalizeJid(receiptEvent?.receipt?.userJid) || undefined,
        status: receiptStatus(receiptEvent?.receipt),
        timestamp:
          normalizeTimestamp(receiptEvent?.receipt?.playedTimestamp) ||
          normalizeTimestamp(receiptEvent?.receipt?.readTimestamp) ||
          normalizeTimestamp(receiptEvent?.receipt?.receiptTimestamp),
      });
    }
  });

  sock.ev.on("presence.update", (event) => {
    const jid = normalizeJid(event?.id);

    if (!jid) {
      return;
    }

    const participants = Object.entries(event?.presences || {});

    emitEvent(
      options,
      "presence.update",
      `Presencas atualizadas: ${participants.length}`,
    );

    for (const [participant, presence] of participants) {
      options.onPresenceUpdate?.({
        jid,
        participant: normalizeJid(participant) || participant,
        lastKnownPresence: (presence as any)?.lastKnownPresence || undefined,
      });
    }
  });

  sock.ev.on("messaging-history.set", ({ messages, contacts, chats }) => {
    const totalHistoryMessages = messages?.length || 0;
    let importedMessages = 0;
    let skippedMessages = 0;

    emitEvent(
      options,
      "messaging-history.set",
      `Historico: mensagens=${totalHistoryMessages}, contatos=${contacts?.length || 0}, chats=${chats?.length || 0}`,
    );

    for (const contact of contacts || []) {
      emitContactUpdate(options, {
        id: contact.id,
        jid: contact.jid,
        lid: contact.lid,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
      });

      const name = pickContactName(contact);
      if (!name) {
        continue;
      }

      const knownJids = [
        normalizeJid(contact.id),
        normalizeJid(contact.jid),
        normalizeJid(contact.lid),
      ].filter((jid): jid is string => !!jid);

      for (const knownJid of knownJids) {
        setContactName(sessionId, knownJid, name);
      }
    }

    for (const historyChat of chats || []) {
      emitChatSnapshot(
        options,
        {
          id: historyChat.id,
          name: historyChat.name,
          unreadCount: historyChat.unreadCount,
          conversationTimestamp: historyChat.conversationTimestamp,
          lastMessageRecvTimestamp: historyChat.lastMessageRecvTimestamp,
        },
        sessionId,
      );
    }

    for (const historyMessage of messages || []) {
      const jid = normalizeJid(historyMessage?.key?.remoteJid) || "";
      const parsed = parseMessagePayloadWithSession(historyMessage, sessionId);

      if (!parsed) {
        skippedMessages += 1;
        continue;
      }

      importedMessages += 1;
      options.onHistoryMessage?.(parsed);
    }

    console.log(
      `[${sessionId}] Historico recebido: total=${totalHistoryMessages}, importadas=${importedMessages}, ignoradas=${skippedMessages}, contatos=${contacts?.length || 0}`,
    );
  });

  sock.ev.on("chats.upsert", (chats) => {
    emitEvent(options, "chats.upsert", `Chats upsert: ${chats?.length || 0}`);

    for (const chat of chats || []) {
      emitChatSnapshot(options, {
        id: chat.id,
        name: chat.name,
        unreadCount: chat.unreadCount,
        conversationTimestamp: chat.conversationTimestamp,
        lastMessageRecvTimestamp: chat.lastMessageRecvTimestamp,
      }, sessionId);
    }
  });

  sock.ev.on("chats.update", (chats) => {
    emitEvent(options, "chats.update", `Chats update: ${chats?.length || 0}`);

    for (const chat of chats || []) {
      emitChatSnapshot(options, {
        id: chat.id,
        name: chat.name,
        unreadCount: chat.unreadCount,
        conversationTimestamp: chat.conversationTimestamp,
        lastMessageRecvTimestamp: chat.lastMessageRecvTimestamp,
      }, sessionId);
    }
  });

  sock.ev.on("contacts.upsert", (contacts) => {
    emitEvent(
      options,
      "contacts.upsert",
      `Contatos novos: ${contacts?.length || 0}`,
    );

    for (const contact of contacts || []) {
      emitContactUpdate(options, {
        id: contact.id,
        jid: contact.jid,
        lid: contact.lid,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
      });

      // Atualiza repositório central de nomes
      const name = pickContactName(contact);
      if (name) {
        const knownJids = [
          normalizeJid(contact.id),
          normalizeJid(contact.jid),
          normalizeJid(contact.lid),
        ].filter((jid): jid is string => !!jid);

        for (const knownJid of knownJids) {
          setContactName(sessionId, knownJid, name);
        }
      }
    }
  });

  sock.ev.on("contacts.update", (contacts) => {
    emitEvent(
      options,
      "contacts.update",
      `Contatos atualizados: ${contacts?.length || 0}`,
    );

    for (const contact of contacts || []) {
      emitContactUpdate(options, {
        id: contact.id,
        jid: contact.jid,
        lid: contact.lid,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
      });

      // Atualiza repositório central de nomes
      const name = pickContactName(contact);
      if (name) {
        const knownJids = [
          normalizeJid(contact.id),
          normalizeJid(contact.jid),
          normalizeJid(contact.lid),
        ].filter((jid): jid is string => !!jid);

        for (const knownJid of knownJids) {
          setContactName(sessionId, knownJid, name);
        }
      }
    }
  });

  sock.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
    emitEvent(
      options,
      "chats.phoneNumberShare",
      "Mapeamento lid para phone number recebido",
    );

    emitContactUpdate(options, {
      id: jid,
      jid,
      lid,
    });

    // Atualiza repositório para mapear LID para JID
    const existingName = getContactName(sessionId, lid);
    if (existingName) {
      setContactName(sessionId, jid, existingName);
    }
  });

  sock.ev.on("groups.upsert", (groups) => {
    emitEvent(
      options,
      "groups.upsert",
      `Grupos carregados: ${groups?.length || 0}`,
    );
  });

  sock.ev.on("groups.update", (groups) => {
    emitEvent(
      options,
      "groups.update",
      `Grupos atualizados: ${groups?.length || 0}`,
    );
  });

  sock.ev.on("group-participants.update", (event) => {
    emitEvent(
      options,
      "group-participants.update",
      `Grupo ${event.id}: ${event.action} (${event.participants?.length || 0} participante(s))`,
    );
  });

  sock.ev.on("blocklist.set", (event) => {
    emitEvent(
      options,
      "blocklist.set",
      `Blocklist total: ${event.blocklist?.length || 0}`,
    );
  });

  sock.ev.on("blocklist.update", (event) => {
    emitEvent(
      options,
      "blocklist.update",
      `Blocklist ${event.type}: ${event.blocklist?.length || 0}`,
    );
  });

  sock.ev.on("call", (events) => {
    emitEvent(options, "call", `Eventos de chamada: ${events?.length || 0}`);
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
    const isLoggedOut = statusCode === DisconnectReason.loggedOut;

    options.onConnectionUpdate?.({
      connection,
      qr,
      statusCode,
      isLoggedOut,
    });

    if (connection) {
      emitEvent(
        options,
        "connection.update",
        `Conexao: ${connection}${statusCode ? ` (${statusCode})` : ""}`,
      );
    }

    if (qr) {
      console.log(`Escaneie o QR da sessao ${sessionId}`);
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      console.log("Conexao fechada. Status:", statusCode);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log("Sessao deslogada. Apague auth e conecte novamente.");
      }
    }

    if (connection === "open") {
      console.log(`Sessao ${sessionId} conectada com sucesso.`);
    }
  });

  return sock;
}
