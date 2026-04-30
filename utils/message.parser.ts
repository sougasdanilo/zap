import type { SessionMessage } from "../types/message.types";
import { 
  normalizeTimestamp, 
  normalizeJid, 
  unwrapMessageContent, 
  pickQuoted, 
  parseInteractive,
  createTextMessage,
  createMediaMessage,
  createSystemMessage,
  createReactionMessage,
  createInteractiveMessage,
  createUnknownMessage
} from "./message.utils";

type MessageContent = any;

// Repositório central de nomes por sessão (importado do session.manager)
declare const contactNamesBySession: Map<string, Map<string, string>>;

function getContactName(sessionId: string, jid: string, fallbackName?: string): string | undefined {
  // Função auxiliar para acessar o repositório central
  try {
    const sessionNames = (globalThis as any).contactNamesBySession?.get(sessionId);
    return sessionNames?.get(jid) || fallbackName;
  } catch {
    return fallbackName;
  }
}

class MessageParser {
  private jid: string;
  private timestamp: number;
  private content: MessageContent;
  private participant?: string;
  private quoted?: any;
  private base: Omit<SessionMessage, 'type' | 'text' | 'media' | 'reaction' | 'interactive'>;

  constructor(message: any) {
    this.jid = normalizeJid(message?.key?.remoteJid) || "";
    this.timestamp = normalizeTimestamp(message?.messageTimestamp) || Date.now();
    this.content = unwrapMessageContent(message?.message);
    this.participant = normalizeJid(message?.key?.participant);
    this.quoted = pickQuoted(this.content);
    
    this.base = {
      id: message?.key?.id,
      jid: this.jid,
      fromMe: !!message?.key?.fromMe,
      timestamp: this.timestamp,
      name: message?.pushName?.trim() || undefined,
      participant: this.participant,
      quoted: this.quoted,
      raw: message,
    };
  }

  static parse(message: any): SessionMessage | null {
    if (!message?.key?.remoteJid || message.key.remoteJid === "status@broadcast") {
      return null;
    }

    const parser = new MessageParser(message);
    return parser.parseMessage();
  }

  static parseWithSessionName(message: any, sessionId: string): SessionMessage | null {
    if (!message?.key?.remoteJid || message.key.remoteJid === "status@broadcast") {
      return null;
    }

    // Tenta obter nome do repositório central
    let enhancedMessage = message;
    if (sessionId && message?.key?.remoteJid) {
      const jid = normalizeJid(message.key.remoteJid);
      if (jid) {
        const repositoryName = getContactName(sessionId, jid, message.pushName);
        if (repositoryName && repositoryName !== message.pushName) {
          enhancedMessage = {
            ...message,
            pushName: repositoryName
          };
        }
      }
    }

    const parser = new MessageParser(enhancedMessage);
    return parser.parseMessage();
  }

  private parseMessage(): SessionMessage | null {
    if (!this.content) {
      return createSystemMessage(this.base, "[Evento sem conteudo]");
    }

    const parsers = [
      () => this.parseTextMessage(),
      () => this.parseMediaMessage(),
      () => this.parseContactMessage(),
      () => this.parseLocationMessage(),
      () => this.parsePollMessage(),
      () => this.parseReactionMessage(),
      () => this.parseInteractiveMessage(),
      () => this.parseProtocolMessage(),
      () => createUnknownMessage(this.base, Object.keys(this.content || {})[0]),
    ];

    for (const parser of parsers) {
      const result = parser();
      if (result) {
        return result;
      }
    }

    return createUnknownMessage(this.base);
  }

  private parseTextMessage(): SessionMessage | null {
    if (this.content?.conversation) {
      return createTextMessage(this.base, this.content.conversation);
    }

    if (this.content?.extendedTextMessage?.text) {
      return createTextMessage(this.base, this.content.extendedTextMessage.text);
    }

    return null;
  }

  private parseMediaMessage(): SessionMessage | null {
    const mediaTypes = [
      { key: "imageMessage", kind: "image" as const, fallback: "[Imagem]" },
      { key: "videoMessage", kind: "video" as const, fallback: "[Video]" },
      { key: "audioMessage", kind: "audio" as const, fallback: "[Audio]" },
      { key: "stickerMessage", kind: "sticker" as const, fallback: "[Sticker]" },
      { key: "documentMessage", kind: "document" as const, fallback: "[Documento]" },
    ];

    for (const { key, kind, fallback } of mediaTypes) {
      const mediaMessage = this.content?.[key];
      if (!mediaMessage) {
        continue;
      }

      const mediaInfo = this.createMediaInfo(mediaMessage, kind);
      const text = mediaInfo.caption || 
        (kind === "document" && mediaMessage.fileName) || 
        fallback;

      return createMediaMessage(this.base, mediaInfo, text);
    }

    return null;
  }

  private parseContactMessage(): SessionMessage | null {
    if (this.content?.contactMessage || this.content?.contactsArrayMessage) {
      return createSystemMessage(this.base, "[Contato]");
    }
    return null;
  }

  private parseLocationMessage(): SessionMessage | null {
    if (this.content?.locationMessage || this.content?.liveLocationMessage) {
      return createSystemMessage(this.base, "[Localizacao]");
    }
    return null;
  }

  private parsePollMessage(): SessionMessage | null {
    const pollKeys = ["pollCreationMessage", "pollCreationMessageV2", "pollCreationMessageV3"];
    
    for (const key of pollKeys) {
      const pollMessage = this.content?.[key];
      if (pollMessage?.name) {
        return createSystemMessage(this.base, `[Enquete] ${pollMessage.name}`);
      }
    }

    if (pollKeys.some(key => this.content?.[key])) {
      return createSystemMessage(this.base, "[Enquete]");
    }

    return null;
  }

  private parseReactionMessage(): SessionMessage | null {
    if (this.content?.reactionMessage) {
      return createReactionMessage(this.base, this.content.reactionMessage);
    }
    return null;
  }

  private parseInteractiveMessage(): SessionMessage | null {
    const interactive = parseInteractive(this.content);
    if (interactive) {
      return createInteractiveMessage(this.base, interactive);
    }
    return null;
  }

  private parseProtocolMessage(): SessionMessage | null {
    const protocol = this.content?.protocolMessage;
    if (!protocol) {
      return null;
    }

    if (protocol?.type === 0 && protocol?.key?.id) {
      return createSystemMessage({
        ...this.base,
        isDeleted: true,
        targetMessageId: protocol.key.id,
      }, "[Mensagem apagada]");
    }

    if (protocol?.editedMessage) {
      return this.parseEditedMessage(protocol);
    }

    return createSystemMessage(this.base, "[Atualizacao de mensagem]");
  }

  private parseEditedMessage(protocol: any): SessionMessage | null {
    const edited = MessageParser.parse({
      key: { ...this.base, id: protocol.key.id },
      message: protocol.editedMessage,
      messageTimestamp: this.timestamp,
      pushName: this.base.name,
    });

    if (!edited) {
      return null;
    }

    return {
      ...edited,
      isEdited: true,
      targetMessageId: protocol?.key?.id || this.base.id,
    };
  }

  private createMediaInfo(mediaMessage: any, kind: "image" | "video" | "audio" | "sticker" | "document") {
    return {
      kind,
      mimetype: mediaMessage?.mimetype || undefined,
      caption: mediaMessage?.caption || undefined,
      fileName: mediaMessage?.fileName || undefined,
      seconds: mediaMessage?.seconds ? Number(mediaMessage.seconds) || undefined : undefined,
      fileLength: Number(mediaMessage?.fileLength || 0) || undefined,
      hasMedia: true,
      mediaKeyTs: normalizeTimestamp(mediaMessage?.mediaKeyTimestamp),
      mediaKey: mediaMessage?.mediaKey || undefined,
    };
  }
}

export function parseMessagePayload(message: any): SessionMessage | null {
  return MessageParser.parse(message);
}

export function parseMessagePayloadWithSession(message: any, sessionId: string): SessionMessage | null {
  return MessageParser.parseWithSessionName(message, sessionId);
}
