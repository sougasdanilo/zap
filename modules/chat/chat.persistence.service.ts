import { database } from "../../config/database";
import { ChatMessage } from "../../models/chatMessage.model";
import { ChatThread } from "../../models/chatThread.model";
import { CrmContact } from "../../models/crmContact.model";
import type {
  ChatMeta,
  ChatMessage as ChatMessagePayload,
  ContactUpdate,
  MessageKind,
  SessionMessage,
} from "../../types/message.types";
import {
  messagePreview,
  normalizeJid,
  normalizeMessageStatus,
  pickContactName,
} from "../../utils/message.utils";
import { ChatStore } from "./chat.store";

type PersistMessageOptions = {
  countUnread?: boolean;
  source?: "history" | "incoming" | "outgoing" | "update";
};

function isGroupJid(jid: string) {
  return jid.endsWith("@g.us");
}

function isPhoneJid(jid: string) {
  return jid.endsWith("@s.whatsapp.net");
}

function isLidJid(jid: string) {
  return jid.endsWith("@lid");
}

function extractPhone(jid: string): string | undefined {
  const match = jid.match(/^(\d{10,})/);
  return match ? match[1] : undefined;
}

function isNumericName(name: string) {
  return !!name.match(/^\d+$/);
}

function normalizeCandidates(values: Array<string | null | undefined>) {
  return values
    .map((value) => normalizeJid(value) || undefined)
    .filter((value, index, all): value is string => {
      return !!value && all.indexOf(value) === index;
    });
}

function chooseCanonicalJid(candidates: string[]) {
  if (!candidates.length) {
    return "";
  }

  const sorted = [...candidates].sort((first, second) => {
    const firstPriority = isPhoneJid(first) ? 3 : isLidJid(first) ? 2 : 1;
    const secondPriority = isPhoneJid(second) ? 3 : isLidJid(second) ? 2 : 1;

    if (firstPriority !== secondPriority) {
      return secondPriority - firstPriority;
    }

    return first.localeCompare(second);
  });

  return sorted[0] || candidates[0];
}

function pickBetterName(current?: string | null, candidate?: string | null) {
  const currentValue = current?.trim();
  const candidateValue = candidate?.trim();

  if (!candidateValue) {
    return currentValue || undefined;
  }

  if (!currentValue) {
    return candidateValue;
  }

  const currentIsNumeric = isNumericName(currentValue);
  const candidateIsNumeric = isNumericName(candidateValue);

  if (currentIsNumeric && !candidateIsNumeric) {
    return candidateValue;
  }

  if (!currentIsNumeric && candidateIsNumeric) {
    return currentValue;
  }

  if (candidateValue.length > currentValue.length) {
    return candidateValue;
  }

  return currentValue;
}

function buildMessageDocId(sessionId: string, messageId: string) {
  return `${sessionId}::${messageId}`;
}

function shouldPersistMessage(message: SessionMessage): boolean {
  if (!message?.jid) return false;
  if (message.jid === "status@broadcast") return false;
  return true;
}

export class ChatPersistenceService {
  private static queues: Map<string, Promise<void>> = new Map();

  private static enqueue(sessionId: string, task: () => Promise<void>) {
    const previous = this.queues.get(sessionId) || Promise.resolve();

    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (!database.isConnectionActive()) {
          return;
        }

        await task();
      })
      .catch((error) => {
        console.error(`[DB][${sessionId}] Persistência falhou:`, error);
      });

    this.queues.set(sessionId, next);
    return next;
  }

  static persistMessage(
    sessionId: string,
    message: SessionMessage,
    options: PersistMessageOptions = {},
  ) {
    if (!shouldPersistMessage(message)) {
      return;
    }

    const normalizedRemoteJid = normalizeJid(message.jid) || message.jid;
    const resolvedJid =
      ChatStore.resolveChatJid(sessionId, normalizedRemoteJid) ||
      normalizedRemoteJid;

    const messageId = message.id?.trim();
    if (!messageId) {
      return;
    }

    const timestamp = Number.isFinite(message.timestamp)
      ? Number(message.timestamp)
      : Date.now();

    const normalizedStatus = message.status
      ? normalizeMessageStatus(message.status as unknown as number | string)
      : undefined;

    const persistedType: MessageKind = message.isDeleted
      ? "system"
      : (message.type || "unknown");
    const persistedText = message.isDeleted
      ? "[Mensagem apagada]"
      : message.text || "";
    const preview = messagePreview({
      type: persistedType,
      text: persistedText,
      media: message.media,
      reaction: message.reaction,
      interactive: message.interactive,
      isDeleted: message.isDeleted,
    });

    const direction = message.fromMe ? "outbound" : "inbound";
    const shouldCountUnread =
      !message.fromMe && options.countUnread !== false ? 1 : 0;

    const candidatePushName = message.name?.trim();

    this.enqueue(sessionId, async () => {
      const docId = buildMessageDocId(sessionId, messageId);

      await ChatMessage.updateOne(
        { _id: docId },
        {
          $set: {
            sessionId,
            id: messageId,
            jid: resolvedJid,
            remoteJid: normalizedRemoteJid,
            fromMe: !!message.fromMe,
            direction,
            timestamp,
            text: persistedText,
            type: persistedType,
            status: normalizedStatus || null,
            rawType: message.rawType || null,
            name: message.name || null,
            participant: message.participant || null,
            media: message.media || null,
            reaction: message.reaction || null,
            interactive: message.interactive || null,
            quoted: message.quoted || null,
            isEdited: !!message.isEdited,
            isDeleted: !!message.isDeleted,
            reactions: Array.isArray(message.reactions) ? message.reactions : [],
          },
        },
        { upsert: true },
      );

      await ChatThread.updateOne(
        { sessionId, jid: resolvedJid },
        {
          $setOnInsert: {
            sessionId,
            jid: resolvedJid,
            unread: 0,
            lastTimestamp: 0,
            lastMessage: "",
            lastMessageType: null,
            isGroup: isGroupJid(resolvedJid),
          },
          $addToSet: {
            aliases: { $each: [resolvedJid, normalizedRemoteJid] },
          },
        },
        { upsert: true },
      );

      if (candidatePushName && !isNumericName(candidatePushName)) {
        await ChatThread.updateOne(
          {
            sessionId,
            jid: resolvedJid,
            $or: [
              { name: { $exists: false } },
              { name: null },
              { name: "" },
              { name: /^\d+$/ },
            ],
          },
          { $set: { name: candidatePushName } },
        );
      }

      if (shouldCountUnread) {
        await ChatThread.updateOne(
          { sessionId, jid: resolvedJid },
          { $inc: { unread: shouldCountUnread } },
        );
      }

      await ChatThread.updateOne(
        { sessionId, jid: resolvedJid, lastTimestamp: { $lte: timestamp } },
        {
          $set: {
            lastTimestamp: timestamp,
            lastMessage: preview,
            lastMessageType: persistedType,
          },
        },
      );

      const kind = isGroupJid(resolvedJid) ? "group" : "individual";
      const phone = kind === "individual" ? extractPhone(resolvedJid) : undefined;

      await CrmContact.updateOne(
        { sessionId, jid: resolvedJid },
        {
          $setOnInsert: {
            sessionId,
            jid: resolvedJid,
            kind,
            ...(phone ? { phone } : {}),
            firstMessageAt: timestamp,
          },
          $addToSet: {
            aliases: { $each: [resolvedJid, normalizedRemoteJid] },
          },
          $max: {
            lastMessageAt: timestamp,
            ...(message.fromMe ? { lastOutboundAt: timestamp } : {}),
            ...(!message.fromMe ? { lastInboundAt: timestamp } : {}),
          },
          $inc: {
            inboundCount: message.fromMe ? 0 : 1,
            outboundCount: message.fromMe ? 1 : 0,
          },
        },
        { upsert: true },
      );

      if (candidatePushName && !isNumericName(candidatePushName)) {
        await CrmContact.updateOne(
          {
            sessionId,
            jid: resolvedJid,
            $or: [
              { pushName: { $exists: false } },
              { pushName: null },
              { pushName: "" },
              { pushName: /^\d+$/ },
            ],
          },
          { $set: { pushName: candidatePushName } },
        );
      }

      await CrmContact.updateOne(
        {
          sessionId,
          jid: resolvedJid,
          $or: [{ firstMessageAt: null }, { firstMessageAt: { $exists: false } }],
        },
        { $set: { firstMessageAt: timestamp } },
      );
    });
  }

  static persistHistoryChat(
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
    const normalizedJid = normalizeJid(payload.jid) || payload.jid;
    const resolvedJid =
      ChatStore.resolveChatJid(sessionId, normalizedJid) || normalizedJid;

    const normalizedUnread = Number.isFinite(Number(payload.unread))
      ? Math.max(0, Math.floor(Number(payload.unread)))
      : 0;
    const normalizedTimestamp = Number.isFinite(Number(payload.lastTimestamp))
      ? Number(payload.lastTimestamp)
      : undefined;

    const candidateName = payload.name?.trim();

    this.enqueue(sessionId, async () => {
      await ChatThread.updateOne(
        { sessionId, jid: resolvedJid },
        {
          $setOnInsert: {
            sessionId,
            jid: resolvedJid,
            lastMessage: "",
            lastMessageType: null,
            isGroup: isGroupJid(resolvedJid),
          },
          $addToSet: {
            aliases: { $each: [resolvedJid, normalizedJid] },
          },
          $max: {
            unread: normalizedUnread,
            lastTimestamp: normalizedTimestamp || 0,
          },
        },
        { upsert: true },
      );

      if (candidateName && !isNumericName(candidateName)) {
        await ChatThread.updateOne(
          {
            sessionId,
            jid: resolvedJid,
            $or: [
              { name: { $exists: false } },
              { name: null },
              { name: "" },
              { name: /^\d+$/ },
            ],
          },
          { $set: { name: candidateName } },
        );
      }
    });
  }

  static persistContactUpdate(sessionId: string, contact: ContactUpdate) {
    const normalizedCandidates = normalizeCandidates([
      contact.jid,
      contact.id,
      contact.lid,
    ]);

    if (!normalizedCandidates.length) {
      return;
    }

    const resolvedCandidates = normalizedCandidates
      .map((jid) => ChatStore.resolveChatJid(sessionId, jid) || jid)
      .filter((jid, index, all) => all.indexOf(jid) === index);

    const aliasSet = Array.from(
      new Set([...normalizedCandidates, ...resolvedCandidates]),
    );

    const canonical =
      chooseCanonicalJid(
        resolvedCandidates.length ? resolvedCandidates : normalizedCandidates,
      ) || normalizedCandidates[0];

    const preferredName = pickContactName({
      name: contact.name,
      notify: contact.notify,
      verifiedName: contact.verifiedName,
    });

    this.enqueue(sessionId, async () => {
      await this.mergeCanonical(sessionId, canonical, aliasSet);

      const kind = isGroupJid(canonical) ? "group" : "individual";
      const phone = kind === "individual" ? extractPhone(canonical) : undefined;

      const existing = await CrmContact.findOne({
        sessionId,
        $or: [{ jid: { $in: aliasSet } }, { aliases: { $in: aliasSet } }],
      }).exec();

      if (!existing) {
        await CrmContact.create({
          sessionId,
          jid: canonical,
          aliases: Array.from(new Set([canonical, ...aliasSet])),
          kind,
          ...(phone ? { phone } : {}),
          name: preferredName || null,
          notify: contact.notify?.trim() || null,
          verifiedName: contact.verifiedName?.trim() || null,
        });
      } else {
        const existingCanonical = existing.jid;
        if (existingCanonical !== canonical) {
          await CrmContact.updateOne(
            { sessionId, jid: existingCanonical },
            { $set: { jid: canonical } },
          );
        }

        await CrmContact.updateOne(
          { sessionId, jid: canonical },
          {
            $set: {
              kind,
              ...(phone ? { phone } : {}),
              ...(preferredName ? { name: preferredName } : {}),
              ...(contact.notify?.trim() ? { notify: contact.notify.trim() } : {}),
              ...(contact.verifiedName?.trim()
                ? { verifiedName: contact.verifiedName.trim() }
                : {}),
            },
            $addToSet: { aliases: { $each: Array.from(new Set([canonical, ...aliasSet])) } },
          },
        );
      }
    });
  }

  static persistMessageUpdate(
    sessionId: string,
    payload: {
      id: string;
      jid: string;
      text?: string;
      timestamp?: number;
      status?: number | string;
      type?: MessageKind;
      rawType?: string;
      media?: SessionMessage["media"];
      interactive?: SessionMessage["interactive"];
      quoted?: SessionMessage["quoted"];
      isEdited?: boolean;
      isDeleted?: boolean;
      participant?: string;
      name?: string;
    },
  ) {
    const normalizedJid = normalizeJid(payload.jid) || payload.jid;
    const resolvedJid =
      ChatStore.resolveChatJid(sessionId, normalizedJid) || normalizedJid;

    const messageId = payload.id?.trim();
    if (!messageId) {
      return;
    }

    const docId = buildMessageDocId(sessionId, messageId);
    const timestamp = Number.isFinite(Number(payload.timestamp))
      ? Number(payload.timestamp)
      : undefined;

    this.enqueue(sessionId, async () => {
      const update: Record<string, unknown> = {
        jid: resolvedJid,
        remoteJid: normalizedJid,
        ...(payload.text ? { text: payload.text } : {}),
        ...(timestamp ? { timestamp } : {}),
        ...(payload.type ? { type: payload.type } : {}),
        ...(typeof payload.status !== "undefined"
          ? {
              status: normalizeMessageStatus(
                payload.status as unknown as number | string,
              ),
            }
          : {}),
        ...(payload.rawType ? { rawType: payload.rawType } : {}),
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.participant ? { participant: payload.participant } : {}),
        ...(payload.media ? { media: payload.media } : {}),
        ...(payload.interactive ? { interactive: payload.interactive } : {}),
        ...(payload.quoted ? { quoted: payload.quoted } : {}),
        ...(payload.isEdited ? { isEdited: true } : {}),
        ...(payload.isDeleted ? { isDeleted: true, type: "system", text: "[Mensagem apagada]" } : {}),
      };

      await ChatMessage.updateOne({ _id: docId }, { $set: update }, { upsert: false });
    });
  }

  static async resolveChatJid(sessionId: string, jid: string) {
    const normalized = normalizeJid(jid) || jid;
    const direct = ChatStore.resolveChatJid(sessionId, normalized);
    if (direct) {
      return direct;
    }

    if (!database.isConnectionActive()) {
      return normalized;
    }

    const thread = await ChatThread.findOne({
      sessionId,
      $or: [{ jid: normalized }, { aliases: normalized }],
    })
      .select({ jid: 1 })
      .exec();

    return thread?.jid || normalized;
  }

  static async listChats(sessionId: string): Promise<ChatMeta[]> {
    if (!database.isConnectionActive()) {
      return [];
    }

    const threads = await ChatThread.find({ sessionId })
      .sort({ lastTimestamp: -1 })
      .limit(500)
      .lean()
      .exec();

    return threads.map((thread) => ({
      jid: thread.jid,
      name: thread.name || undefined,
      unread: Number(thread.unread || 0) || 0,
      lastTimestamp: Number(thread.lastTimestamp || 0) || 0,
      lastMessage: thread.lastMessage || "",
      lastMessageType: (thread.lastMessageType as MessageKind) || undefined,
    }));
  }

  static async getMessages(
    sessionId: string,
    jid: string,
    options: { limit?: number } = {},
  ): Promise<ChatMessagePayload[]> {
    if (!database.isConnectionActive()) {
      return [];
    }

    const normalizedLimit = Number.isFinite(Number(options.limit))
      ? Math.max(1, Math.min(2000, Math.floor(Number(options.limit))))
      : undefined;

    const normalizeDoc = (doc: any): ChatMessagePayload => ({
      id: doc.id,
      jid: doc.jid,
      text: doc.text || "",
      direction: doc.direction,
      fromMe: !!doc.fromMe,
      timestamp: Number(doc.timestamp || 0) || 0,
      type: doc.type || "unknown",
      status: doc.status || undefined,
      rawType: doc.rawType || undefined,
      name: doc.name || undefined,
      participant: doc.participant || undefined,
      media: doc.media || undefined,
      reaction: doc.reaction || undefined,
      interactive: doc.interactive || undefined,
      quoted: doc.quoted || undefined,
      isEdited: !!doc.isEdited || undefined,
      isDeleted: !!doc.isDeleted || undefined,
      reactions: Array.isArray(doc.reactions) ? doc.reactions : undefined,
    });

    if (normalizedLimit) {
      const newestFirst = await ChatMessage.find({ sessionId, jid })
        .sort({ timestamp: -1 })
        .limit(normalizedLimit)
        .lean()
        .exec();
      return newestFirst.reverse().map(normalizeDoc);
    }

    const docs = await ChatMessage.find({ sessionId, jid })
      .sort({ timestamp: 1 })
      .lean()
      .exec();
    return docs.map(normalizeDoc);
  }

  static markAsRead(sessionId: string, jid: string) {
    const normalized = normalizeJid(jid) || jid;
    const resolved = ChatStore.resolveChatJid(sessionId, normalized) || normalized;

    this.enqueue(sessionId, async () => {
      await ChatThread.updateOne(
        { sessionId, jid: resolved },
        { $set: { unread: 0 } },
        { upsert: false },
      );
    });
  }

  private static async mergeCanonical(
    sessionId: string,
    canonicalJid: string,
    aliases: string[],
  ) {
    const aliasSet = Array.from(new Set([canonicalJid, ...aliases]));

    await ChatMessage.updateMany(
      { sessionId, jid: { $in: aliasSet } },
      { $set: { jid: canonicalJid } },
    );

    const threads = await ChatThread.find({
      sessionId,
      jid: { $in: aliasSet },
    }).exec();

    let target = threads.find((thread) => thread.jid === canonicalJid) || null;

    if (!target) {
      if (threads.length) {
        target = threads[0];
        target.jid = canonicalJid;
      } else {
        target = new ChatThread({
          sessionId,
          jid: canonicalJid,
          aliases: [],
          unread: 0,
          lastTimestamp: 0,
          lastMessage: "",
          isGroup: isGroupJid(canonicalJid),
        });
      }
    }

    const mergedAliases = new Set<string>([
      canonicalJid,
      ...aliasSet,
      ...(target.aliases || []),
    ]);

    let bestName = target.name;
    let bestLastTimestamp = target.lastTimestamp || 0;
    let bestLastMessage = target.lastMessage || "";
    let bestLastMessageType = target.lastMessageType as MessageKind | undefined;
    let bestUnread = Number(target.unread || 0) || 0;

    for (const thread of threads) {
      if (thread._id?.toString() === target._id?.toString()) {
        continue;
      }

      for (const alias of thread.aliases || []) {
        mergedAliases.add(alias);
      }

      bestName = pickBetterName(bestName, thread.name);
      bestUnread = Math.max(bestUnread, Number(thread.unread || 0) || 0);

      const threadTimestamp = Number(thread.lastTimestamp || 0) || 0;
      if (threadTimestamp > bestLastTimestamp) {
        bestLastTimestamp = threadTimestamp;
        bestLastMessage = thread.lastMessage || bestLastMessage;
        bestLastMessageType = (thread.lastMessageType as MessageKind) || bestLastMessageType;
      }
    }

    target.aliases = Array.from(mergedAliases);
    target.name = bestName || null;
    target.unread = bestUnread;
    target.lastTimestamp = bestLastTimestamp;
    target.lastMessage = bestLastMessage;
    if (bestLastMessageType) {
      (target as any).lastMessageType = bestLastMessageType;
    }
    target.isGroup = isGroupJid(canonicalJid);

    await target.save();

    const deleteIds = threads
      .filter((thread) => thread._id?.toString() !== target?._id?.toString())
      .map((thread) => thread._id);

    if (deleteIds.length) {
      await ChatThread.deleteMany({ _id: { $in: deleteIds } }).exec();
    }

    const contacts = await CrmContact.find({
      sessionId,
      $or: [{ jid: { $in: aliasSet } }, { aliases: { $in: aliasSet } }],
    }).exec();

    if (!contacts.length) {
      return;
    }

    let contactTarget = contacts.find((doc) => doc.jid === canonicalJid) || contacts[0];

    const mergedContactAliases = new Set<string>([
      canonicalJid,
      ...aliasSet,
      ...(contactTarget.aliases || []),
    ]);

    let mergedName = contactTarget.name;
    let mergedPushName = contactTarget.pushName;
    let mergedNotify = contactTarget.notify;
    let mergedVerified = contactTarget.verifiedName;

    let inboundCount = Number(contactTarget.inboundCount || 0) || 0;
    let outboundCount = Number(contactTarget.outboundCount || 0) || 0;

    let firstMessageAt = contactTarget.firstMessageAt || undefined;
    let lastMessageAt = contactTarget.lastMessageAt || undefined;
    let lastInboundAt = contactTarget.lastInboundAt || undefined;
    let lastOutboundAt = contactTarget.lastOutboundAt || undefined;

    for (const doc of contacts) {
      if (doc._id?.toString() === contactTarget._id?.toString()) {
        continue;
      }

      for (const alias of doc.aliases || []) {
        mergedContactAliases.add(alias);
      }

      mergedName = pickBetterName(mergedName, doc.name);
      mergedPushName = pickBetterName(mergedPushName, doc.pushName);
      mergedNotify = pickBetterName(mergedNotify, doc.notify);
      mergedVerified = pickBetterName(mergedVerified, doc.verifiedName);

      inboundCount += Number(doc.inboundCount || 0) || 0;
      outboundCount += Number(doc.outboundCount || 0) || 0;

      const docFirst = doc.firstMessageAt || undefined;
      if (docFirst && (!firstMessageAt || docFirst < firstMessageAt)) {
        firstMessageAt = docFirst;
      }

      const docLast = doc.lastMessageAt || undefined;
      if (docLast && (!lastMessageAt || docLast > lastMessageAt)) {
        lastMessageAt = docLast;
      }

      const docLastIn = doc.lastInboundAt || undefined;
      if (docLastIn && (!lastInboundAt || docLastIn > lastInboundAt)) {
        lastInboundAt = docLastIn;
      }

      const docLastOut = doc.lastOutboundAt || undefined;
      if (docLastOut && (!lastOutboundAt || docLastOut > lastOutboundAt)) {
        lastOutboundAt = docLastOut;
      }
    }

    contactTarget.jid = canonicalJid;
    contactTarget.aliases = Array.from(mergedContactAliases);
    contactTarget.name = mergedName || null;
    contactTarget.pushName = mergedPushName || null;
    contactTarget.notify = mergedNotify || null;
    contactTarget.verifiedName = mergedVerified || null;
    contactTarget.inboundCount = inboundCount;
    contactTarget.outboundCount = outboundCount;
    contactTarget.firstMessageAt = firstMessageAt || null;
    contactTarget.lastMessageAt = lastMessageAt || null;
    contactTarget.lastInboundAt = lastInboundAt || null;
    contactTarget.lastOutboundAt = lastOutboundAt || null;

    if (contactTarget.kind === "individual") {
      contactTarget.phone = extractPhone(canonicalJid) || contactTarget.phone || null;
    }

    await contactTarget.save();

    const contactDeleteIds = contacts
      .filter((doc) => doc._id?.toString() !== contactTarget._id?.toString())
      .map((doc) => doc._id);

    if (contactDeleteIds.length) {
      await CrmContact.deleteMany({ _id: { $in: contactDeleteIds } }).exec();
    }
  }
}
