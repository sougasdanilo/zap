import { jidNormalizedUser } from "@whiskeysockets/baileys";
import type { MessageKind, MessageStatus, MessageMedia, MessageInteractive, MessageQuote } from "../types/message.types";

export function normalizeTimestamp(value: any): number | undefined {
  if (value === null || typeof value === "undefined") {
    return undefined;
  }

  const numericValue =
    typeof value === "object" && typeof value.toNumber === "function"
      ? Number(value.toNumber())
      : Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return undefined;
  }

  return numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000;
}

export function normalizeJid(jid?: string | null): string | undefined {
  if (!jid) {
    return undefined;
  }

  const normalized = jidNormalizedUser(jid);
  return normalized || undefined;
}

export function normalizeMessageStatus(
  status?: number | string | null,
): MessageStatus {
  if (status === "error") return "error";
  if (status === "pending") return "pending";
  if (status === "server_ack") return "server_ack";
  if (status === "delivery_ack") return "delivery_ack";
  if (status === "read") return "read";
  if (status === "played") return "played";
  if (status === "ERROR" || status === 0) return "error";
  if (status === "PENDING" || status === 1) return "pending";
  if (status === "SERVER_ACK" || status === 2) return "server_ack";
  if (status === "DELIVERY_ACK" || status === 3) return "delivery_ack";
  if (status === "READ" || status === 4) return "read";
  if (status === "PLAYED" || status === 5) return "played";
  return "unknown";
}

export function unwrapMessageContent(message: any) {
  const wrappers = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "editedMessage",
    "deviceSentMessage",
  ];

  let content = message;
  let depth = 0;

  while (content && depth < wrappers.length) {
    const next = wrappers
      .map((wrapper) => content?.[wrapper]?.message)
      .find((value) => !!value);

    if (!next) {
      break;
    }

    content = next;
    depth += 1;
  }

  return content;
}

export function pickContactName(contact: {
  name?: string | null;
  notify?: string | null;
  verifiedName?: string | null;
}) {
  const name = contact.name?.trim();
  if (name && name.length > 0 && !name.match(/^\d+$/)) {
    return name;
  }

  const notify = contact.notify?.trim();
  if (notify && notify.length > 0 && !notify.match(/^\d+$/)) {
    return notify;
  }

  const verifiedName = contact.verifiedName?.trim();
  if (verifiedName && verifiedName.length > 0 && !verifiedName.match(/^\d+$/)) {
    return verifiedName;
  }

  return undefined;
}

export function pickQuoted(content: any): MessageQuote | undefined {
  const context =
    content?.extendedTextMessage?.contextInfo ||
    content?.imageMessage?.contextInfo ||
    content?.videoMessage?.contextInfo ||
    content?.documentMessage?.contextInfo ||
    content?.buttonsResponseMessage?.contextInfo ||
    content?.interactiveResponseMessage?.contextInfo;

  if (!context) {
    return undefined;
  }

  const quotedText =
    context?.quotedMessage?.conversation ||
    context?.quotedMessage?.extendedTextMessage?.text ||
    context?.quotedMessage?.imageMessage?.caption ||
    context?.quotedMessage?.videoMessage?.caption ||
    context?.quotedMessage?.documentMessage?.caption;

  return {
    id: context?.stanzaId || undefined,
    participant: normalizeJid(context?.participant) || undefined,
    text: quotedText || undefined,
  };
}

function createMediaInfo(
  mediaMessage: any,
  kind: MessageMedia["kind"],
  caption?: string,
): MessageMedia {
  return {
    kind,
    mimetype: mediaMessage?.mimetype || undefined,
    caption: caption || mediaMessage?.caption || undefined,
    fileLength: Number(mediaMessage?.fileLength || 0) || undefined,
    hasMedia: true,
    mediaKeyTs: normalizeTimestamp(mediaMessage?.mediaKeyTimestamp),
    seconds: mediaMessage?.seconds ? Number(mediaMessage.seconds) || undefined : undefined,
  };
}

function parseInteractiveButtons(content: any): MessageInteractive | undefined {
  if (!content?.buttonsMessage) {
    return undefined;
  }

  const buttons = (content.buttonsMessage.buttons || []).map(
    (button: any) => ({
      id: button?.buttonId || "",
      title: button?.buttonText?.displayText || button?.buttonId || "Opcao",
    }),
  );

  return {
    kind: "buttons",
    title: content.buttonsMessage?.headerText || undefined,
    body: content.buttonsMessage?.contentText || "",
    footer: content.buttonsMessage?.footerText || undefined,
    options: buttons,
  };
}

function parseInteractiveList(content: any): MessageInteractive | undefined {
  if (!content?.listMessage) {
    return undefined;
  }

  const options: Array<{ id: string; title: string; description?: string }> = [];
  for (const section of content.listMessage.sections || []) {
    for (const row of section?.rows || []) {
      options.push({
        id: row?.rowId || "",
        title: row?.title || row?.rowId || "Item",
        description: row?.description || undefined,
      });
    }
  }

  return {
    kind: "list",
    title: content.listMessage?.title || undefined,
    body: content.listMessage?.description || "",
    footer: content.listMessage?.footerText || undefined,
    options,
  };
}

function parseInteractiveTemplate(content: any): MessageInteractive | undefined {
  if (!content?.templateMessage) {
    return undefined;
  }

  return {
    kind: "template",
    body: "[Mensagem template]",
  };
}

function parseInteractiveNative(content: any): MessageInteractive | undefined {
  if (!content?.interactiveMessage) {
    return undefined;
  }

  return {
    kind: "native",
    title: content.interactiveMessage?.header?.title || undefined,
    body: content.interactiveMessage?.body?.text || "",
    footer: content.interactiveMessage?.footer?.text || undefined,
  };
}

function parseInteractiveResponse(content: any): MessageInteractive | undefined {
  const responseTypes = [
    { key: "buttonsResponseMessage", textKey: "selectedDisplayText", idKey: "selectedButtonId", defaultText: "[Resposta de botao]" },
    { key: "listResponseMessage", textKey: "title", idKey: "singleSelectReply.selectedRowId", defaultText: "[Resposta de lista]" },
    { key: "templateButtonReplyMessage", textKey: "selectedDisplayText", idKey: "selectedId", defaultText: "[Resposta de template]" },
    { key: "interactiveResponseMessage", textKey: "paramsJson", idKey: "nativeFlowResponseMessage.name", defaultText: "[Resposta interativa]" },
  ];

  for (const responseType of responseTypes) {
    const response = content?.[responseType.key];
    if (!response) {
      continue;
    }

    let selectedId: string | undefined;
    let selectedText: string | undefined;

    if (responseType.key === "listResponseMessage") {
      selectedId = response?.singleSelectReply?.selectedRowId || undefined;
      selectedText = response?.title || undefined;
    } else if (responseType.key === "interactiveResponseMessage") {
      selectedId = response?.nativeFlowResponseMessage?.name || undefined;
      selectedText = response?.nativeFlowResponseMessage?.paramsJson || undefined;
    } else {
      selectedId = response?.[responseType.idKey] || undefined;
      selectedText = response?.[responseType.textKey] || undefined;
    }

    return {
      kind: "response",
      selectedId,
      selectedText,
      body: selectedText || responseType.defaultText,
    };
  }

  return undefined;
}

export function parseInteractive(content: any): MessageInteractive | undefined {
  return (
    parseInteractiveButtons(content) ||
    parseInteractiveList(content) ||
    parseInteractiveTemplate(content) ||
    parseInteractiveNative(content) ||
    parseInteractiveResponse(content)
  );
}

export function createTextMessage(base: any, text: string) {
  return {
    ...base,
    type: "text" as MessageKind,
    text,
  };
}

export function createMediaMessage(base: any, mediaInfo: MessageMedia, fallbackText: string) {
  return {
    ...base,
    type: mediaInfo.kind as MessageKind,
    text: mediaInfo.caption || fallbackText,
    media: mediaInfo,
  };
}

export function createSystemMessage(base: any, text: string) {
  return {
    ...base,
    type: "system" as MessageKind,
    text,
  };
}

export function createReactionMessage(base: any, reaction: any) {
  return {
    ...base,
    type: "reaction" as MessageKind,
    text: reaction.text ? `[Reacao] ${reaction.text}` : "[Reacao removida]",
    reaction: {
      targetId: reaction.key?.id || undefined,
      emoji: reaction.text || undefined,
    },
    targetMessageId: reaction.key?.id || undefined,
  };
}

export function createInteractiveMessage(base: any, interactive: MessageInteractive) {
  return {
    ...base,
    type: "interactive" as MessageKind,
    text: interactive.body || "[Mensagem interativa]",
    interactive,
  };
}

export function createUnknownMessage(base: any, rawType?: string) {
  return {
    ...base,
    type: "unknown" as MessageKind,
    text: "[Mensagem nao suportada]",
    rawType,
  };
}

export function messagePreview(message: {
  type?: MessageKind;
  text?: string;
  media?: MessageMedia;
  reaction?: { emoji?: string };
  interactive?: MessageInteractive;
  isDeleted?: boolean;
}): string {
  if (message.isDeleted) {
    return "[Mensagem apagada]";
  }

  if (message.type === "reaction") {
    return message.reaction?.emoji
      ? `[Reacao] ${message.reaction.emoji}`
      : "[Reacao]";
  }

  if (message.type === "interactive") {
    const kind = message.interactive?.kind || "interactive";
    return `[Interativa ${kind}] ${message.text || ""}`.trim();
  }

  const typeTexts: Record<MessageKind, (msg: typeof message) => string> = {
    text: (msg) => msg.text || "",
    image: (msg) => msg.text || "[Imagem]",
    video: (msg) => msg.text || "[Video]",
    audio: (msg) => msg.text || "[Audio]",
    sticker: () => "[Sticker]",
    document: (msg) => msg.media?.fileName ? `[Documento] ${msg.media.fileName}` : "[Documento]",
    contact: () => "[Contato]",
    location: () => "[Localizacao]",
    poll: (msg) => msg.text || "[Enquete]",
    reaction: (msg) => msg.reaction?.emoji ? `[Reacao] ${msg.reaction.emoji}` : "[Reacao]",
    interactive: (msg) => msg.text || "[Mensagem interativa]",
    system: (msg) => msg.text || "[Sistema]",
    unknown: () => "[Mensagem]",
  };

  const getText = typeTexts[message.type || "unknown"];
  return getText ? getText(message) : "[Mensagem]";
}
