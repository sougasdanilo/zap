import {
  downloadMediaMessage,
  jidNormalizedUser,
  WASocket,
} from "@whiskeysockets/baileys";
import { existsSync, readdirSync, rmSync } from "fs";
import path from "path";
import pino from "pino";
import { ChatStore } from "../chat/chat.store";
import { ChatPersistenceService } from "../chat/chat.persistence.service";
import { createSession } from "./session.manager";
import { profileService } from "./profile.service";
import type {
  SessionConnectionStatus,
  SessionState,
  SendMessagePayload
} from "../../types/message.types";
import { normalizeJid } from "../../utils/message.utils";
import { MessageSender } from "../../utils/message.sender";
import { AIConversationService } from "../ai/ai.conversation.service";

const sessions: Map<string, WASocket> = new Map();
const reconnecting: Set<string> = new Set();
const rawMessages: Map<string, Map<string, any>> = new Map();
const sessionStates: Map<string, SessionState> = new Map();

function setState(sessionId: string, next: Partial<SessionState>) {
  const current = sessionStates.get(sessionId);
  sessionStates.set(sessionId, {
    status: current?.status || "idle",
    ...current,
    ...next,
    updatedAt: Date.now(),
  });
}

function parseDataUrl(dataUrl?: string): {
  buffer?: Buffer;
  mimetype?: string;
} {
  if (!dataUrl) {
    return {};
  }

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return {};
  }

  return {
    mimetype: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function buildMediaSource(payload: SendMessagePayload): {
  source: Buffer | { url: string };
  mimetype?: string;
} {
  const parsedDataUrl = parseDataUrl(payload.mediaDataUrl);

  if (parsedDataUrl.buffer) {
    return {
      source: parsedDataUrl.buffer,
      mimetype: payload.mimetype || parsedDataUrl.mimetype,
    };
  }

  const mediaUrl = payload.mediaUrl?.trim();

  if (!mediaUrl) {
    throw new Error(
      "Midia nao informada. Envie mediaDataUrl (base64) ou mediaUrl",
    );
  }

  return {
    source: { url: mediaUrl },
    mimetype: payload.mimetype,
  };
}

function inferMediaType(
  payload: SendMessagePayload,
): "image" | "video" | "audio" | "document" | "sticker" {
  if (payload.type === "sticker") {
    return "sticker";
  }

  const mime = (payload.mimetype || "").toLowerCase();

  if (mime.includes("image")) return "image";
  if (mime.includes("video")) return "video";
  if (mime.includes("audio")) return "audio";
  if (mime.includes("webp")) return "sticker";

  if (payload.fileName?.toLowerCase().endsWith(".webp")) {
    return "sticker";
  }

  return "document";
}

function isMediaExpired(message: any): boolean {
  // Verifica se a mídia expirou baseado no timestamp da mensagem
  if (!message?.messageTimestamp) {
    return false; // Não podemos verificar sem timestamp
  }
  
  const messageTime = typeof message.messageTimestamp.toNumber === 'function' 
    ? message.messageTimestamp.toNumber() 
    : Number(message.messageTimestamp);
  
  const currentTime = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000; // 24 horas em ms
  
  return (currentTime - messageTime) > twentyFourHours;
}

function createMediaPlaceholder(messageType: string): { mimeType: string; dataUrl: string } {
  // Create a placeholder for expired media
  const placeholders = {
    imageMessage: { mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' },
    videoMessage: { mimeType: 'video/mp4', dataUrl: 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAs1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb2JlXGVkYXUuNDUgMjAxMTIwNjE6IDI6MDA6MDkgICAgICAgICA=' },
    audioMessage: { mimeType: 'audio/mpeg', dataUrl: 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAASAAAOsAAqKioqKioqKioqKioqKioqNTU1NTU1NTU1NTU1NTU1NTU1QEBAQEBAQEBAQEBAQEBAQEBAS0tLS0tLS0tLS0tLS0tLS0t' },
    documentMessage: { mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjcKJeLjz9M=' },
    stickerMessage: { mimeType: 'image/webp', dataUrl: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=' }
  };
  
  return placeholders[messageType] || { mimeType: 'application/octet-stream', dataUrl: 'data:application/octet-stream;base64,' };
}

function extractMediaKey(message: any): Buffer | null {
  if (!message?.message) return null;
  
  const mediaTypes = [
    'imageMessage',
    'videoMessage', 
    'audioMessage',
    'stickerMessage',
    'documentMessage'
  ];
  
  for (const mediaType of mediaTypes) {
    const mediaMessage = message.message[mediaType];
    if (mediaMessage?.mediaKey) {
      return mediaMessage.mediaKey;
    }
  }
  
  return null;
}

function cacheRawMessage(
  sessionId: string,
  jid?: string,
  id?: string,
  raw?: any,
) {
  if (!jid || !id || !raw) {
    return;
  }

  if (!rawMessages.has(sessionId)) {
    rawMessages.set(sessionId, new Map());
  }

  const cache = rawMessages.get(sessionId);
  cache?.set(`${jid}::${id}`, raw);

  if (cache && cache.size > 2500) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
}

function findRawMessage(sessionId: string, jid: string, messageId: string) {
  const cache = rawMessages.get(sessionId);

  if (!cache) {
    return undefined;
  }

  const direct = cache.get(`${jid}::${messageId}`);
  if (direct) {
    return direct;
  }

  for (const [key, value] of cache.entries()) {
    if (key.endsWith(`::${messageId}`)) {
      return value;
    }
  }

  return undefined;
}

export class WhatsAppService {
  static async initSession(sessionId: string, force = false) {
    if (!force && sessions.has(sessionId)) {
      return sessions.get(sessionId);
    }

    setState(sessionId, {
      status: "connecting",
      qr: undefined,
      lastStatusCode: undefined,
    });

    const sock = await createSession(sessionId, {
      onIncomingMessage: (message) => {
        cacheRawMessage(sessionId, message.jid, message.id, message.raw);

        if (message.fromMe) {
          ChatStore.addOutgoing(sessionId, {
            id: message.id,
            jid: message.jid,
            text: message.text,
            timestamp: message.timestamp,
            name: message.name,
            participant: message.participant,
            type: message.type,
            status: message.status,
            rawType: message.rawType,
            media: message.media,
            reaction: message.reaction,
            interactive: message.interactive,
            quoted: message.quoted,
            isEdited: message.isEdited,
            isDeleted: message.isDeleted,
            raw: message.raw,
          });

          ChatPersistenceService.persistMessage(sessionId, message, {
            countUnread: false,
            source: "outgoing",
          });
          return;
        }

        ChatStore.addIncoming(sessionId, {
          id: message.id,
          jid: message.jid,
          text: message.text,
          timestamp: message.timestamp,
          name: message.name,
          participant: message.participant,
          type: message.type,
          status: message.status,
          rawType: message.rawType,
          media: message.media,
          reaction: message.reaction,
          interactive: message.interactive,
          quoted: message.quoted,
          isEdited: message.isEdited,
          isDeleted: message.isDeleted,
          raw: message.raw,
        });

        ChatPersistenceService.persistMessage(sessionId, message, {
          countUnread: true,
          source: "incoming",
        });

        // Processa mensagem com IA se estiver habilitado
        if (message.text && message.text.trim().length > 0) {
          AIConversationService.processIncomingMessage(sessionId, message.jid, message.text)
            .catch(error => console.error('Error in AI processing:', error));
        }
      },
      onHistoryMessage: (message) => {
        cacheRawMessage(sessionId, message.jid, message.id, message.raw);

        ChatStore.addHistory(sessionId, {
          id: message.id,
          jid: message.jid,
          text: message.text,
          fromMe: message.fromMe,
          timestamp: message.timestamp,
          name: message.name,
          participant: message.participant,
          type: message.type,
          status: message.status,
          rawType: message.rawType,
          media: message.media,
          reaction: message.reaction,
          interactive: message.interactive,
          quoted: message.quoted,
          isEdited: message.isEdited,
          isDeleted: message.isDeleted,
          raw: message.raw,
        });

        ChatPersistenceService.persistMessage(sessionId, message, {
          countUnread: false,
          source: "history",
        });
      },
      onHistoryChat: (chat) => {
        ChatStore.upsertHistoryChat(sessionId, chat);
        ChatPersistenceService.persistHistoryChat(sessionId, chat);
      },
      onContactUpdate: (contact) => {
        ChatStore.upsertContact(sessionId, contact);
        ChatPersistenceService.persistContactUpdate(sessionId, contact);
        
        // Carrega foto de perfil automaticamente em background
        profileService.handleContactUpdate(sessionId, sock, contact).catch(() => {
          // Ignora erros, é apenas background loading
        });
      },
      onMessageUpdate: (update) => {
        ChatStore.updateMessage(sessionId, update);
        ChatPersistenceService.persistMessageUpdate(sessionId, update);
      },
      onMessageDelete: ({ jid, messageId, timestamp }) => {
        ChatStore.markMessageDeleted(sessionId, jid, messageId, timestamp);
        ChatPersistenceService.persistMessageUpdate(sessionId, {
          id: messageId,
          jid,
          timestamp,
          isDeleted: true,
        });
      },
      onReaction: ({ jid, messageId, emoji, actor, fromMe, timestamp }) => {
        ChatStore.applyReaction(sessionId, {
          jid,
          messageId,
          emoji,
          actor,
          fromMe,
          timestamp,
        });
      },
      onMessageReceipt: ({ jid, messageId, status, timestamp }) => {
        ChatStore.updateMessage(sessionId, {
          id: messageId,
          jid,
          status,
          timestamp,
        });
        ChatPersistenceService.persistMessageUpdate(sessionId, {
          id: messageId,
          jid,
          status,
          timestamp,
        });
      },
      onPresenceUpdate: ({ jid, participant, lastKnownPresence }) => {
        ChatStore.addEvent(
          sessionId,
          "presence.update",
          `${participant} em ${jid}: ${lastKnownPresence || "desconhecido"}`,
        );
      },
      onEvent: ({ name, summary }) => {
        ChatStore.addEvent(sessionId, name, summary);
      },
      onConnectionUpdate: async ({ connection, qr, statusCode, isLoggedOut }) => {
        if (qr) {
          setState(sessionId, { status: "qr", qr });
        }

        if (connection === "open") {
          setState(sessionId, { status: "connected", qr: undefined });
        }

        if (connection === "close") {
          sessions.delete(sessionId);

          if (isLoggedOut) {
            rawMessages.delete(sessionId);
            // Auto-delete credentials when logged out
            await this.deleteSessionCredentials(sessionId);
            setState(sessionId, {
              status: "closed",
              qr: undefined,
              lastStatusCode: statusCode,
            });
            return;
          }

          setState(sessionId, {
            status: "connecting",
            qr: undefined,
            lastStatusCode: statusCode,
          });
          this.reconnectSession(sessionId);
        }
      },
    });

    sessions.set(sessionId, sock);
    return sock;
  }

  static getSession(sessionId: string) {
    return sessions.get(sessionId);
  }

  static async sendMessage(sessionId: string, payload: SendMessagePayload) {
    const sock = sessions.get(sessionId);

    if (!sock) {
      throw new Error("Sessao nao encontrada");
    }

    const normalizedJid = jidNormalizedUser(payload.jid);

    if (!normalizedJid) {
      throw new Error("jid invalido");
    }

    const sender = new MessageSender(sock, sessionId);
    return await sender.sendMessage({ ...payload, jid: normalizedJid });
  }

  static async getMediaContent(
    sessionId: string,
    jid: string,
    messageId: string,
  ) {
    const sock = sessions.get(sessionId);

    if (!sock) {
      throw new Error("Sessao nao encontrada");
    }

    // Verifica se a sessão está conectada
    if (!sock.user) {
      throw new Error("Sessao nao esta conectada - nao e possivel baixar midia");
    }

    const normalizedJid = jidNormalizedUser(jid);

    if (!normalizedJid) {
      throw new Error("jid invalido");
    }

    console.log(`[DEBUG] Looking for media: sessionId=${sessionId}, jid=${jid}, normalizedJid=${normalizedJid}, messageId=${messageId}`);

    const rawMessage = findRawMessage(sessionId, normalizedJid, messageId);

    if (!rawMessage) {
      // Try to find the message in ChatStore as fallback
      const storedMessage = ChatStore.getMessage(sessionId, normalizedJid, messageId);
      if (storedMessage?.raw) {
        console.log(`[DEBUG] Found message in ChatStore fallback for ${messageId}`);
        // Cache this raw message for future requests
        cacheRawMessage(sessionId, normalizedJid, messageId, storedMessage.raw);
      } else {
        console.error(`[DEBUG] Media message not found in cache or ChatStore: ${messageId}`);
        throw new Error("Mensagem de midia nao encontrada no cache");
      }
    }

    const messageToUse = rawMessage || ChatStore.getMessage(sessionId, normalizedJid, messageId)?.raw;
    
    if (!messageToUse) {
      throw new Error("Mensagem de midia nao encontrada");
    }

    // Check if media key exists in the raw message
    const mediaKey = extractMediaKey(messageToUse);
    if (!mediaKey) {
      console.error(`[DEBUG] Missing media key for message ${messageId}. Raw message structure:`, {
        messageType: Object.keys(messageToUse.message || {}),
        hasMediaMessage: !!messageToUse.message?.mediaMessage,
        mediaKeys: Object.keys(messageToUse.message?.mediaMessage || {}),
        fullMediaMessage: messageToUse.message?.mediaMessage
      });
      throw new Error("Chave de mídia não encontrada na mensagem");
    }

    console.log(`[DEBUG] Found media message with key, attempting download...`);

    let lastError: any = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        console.log(`[DEBUG] Download attempt ${retryCount + 1}/${maxRetries} for message ${messageId}`);
        
        // Ensure we have a fresh socket connection
        const currentSock = sessions.get(sessionId);
        if (!currentSock || !currentSock.user) {
          throw new Error("Session disconnected during media download");
        }

        const buffer = await downloadMediaMessage(messageToUse, "buffer", {}, {
          logger: pino({ level: "silent" }),
          reuploadRequest: currentSock.updateMediaMessage,
        } as any);

        const storedMessage = ChatStore.getMessage(
          sessionId,
          normalizedJid,
          messageId,
        );
        const mimeType =
          storedMessage?.media?.mimetype || "application/octet-stream";

        console.log(`[DEBUG] Successfully downloaded media: ${mimeType}, size: ${buffer.length} bytes`);

        return {
          mimeType,
          dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
        };

      } catch (downloadError: any) {
        lastError = downloadError;
        retryCount++;
        
        console.error(`[DEBUG] Download attempt ${retryCount} failed:`, {
          error: downloadError.message,
          status: downloadError.response?.status,
          statusText: downloadError.response?.statusText,
          messageId,
          jid: normalizedJid
        });

        // Specific handling for 403 Forbidden errors
        if (downloadError.response?.status === 403) {
          console.warn(`[DEBUG] Media access forbidden (403) for message ${messageId}. Attempt ${retryCount}/${maxRetries}`);
          
          // Check if media is expired first and return placeholder
          if (isMediaExpired(messageToUse)) {
            console.warn(`[DEBUG] Media confirmed expired - timestamp: ${messageToUse.messageTimestamp}`);
            
            // Determine media type for appropriate placeholder
            let mediaType = 'documentMessage'; // default
            for (const type of ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage']) {
              if (messageToUse.message?.[type]) {
                mediaType = type;
                break;
              }
            }
            
            const placeholder = createMediaPlaceholder(mediaType);
            console.log(`[DEBUG] Returning ${placeholder.mimeType} placeholder for expired media`);
            
            return {
              mimeType: placeholder.mimeType,
              dataUrl: placeholder.dataUrl,
              expired: true,
              originalError: 'Media expired - WhatsApp media links expire after ~24 hours'
            };
          }

          // For 403 errors, try to refresh the media URL by requesting message update
          if (retryCount < maxRetries) {
            console.log(`[DEBUG] Attempting to refresh media URL...`);
            try {
              const currentSock = sessions.get(sessionId);
              if (currentSock) {
                // Try to get a fresh copy of the message to refresh the media URL
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
                continue; // Retry with fresh context
              }
            } catch (refreshError: any) {
              console.warn(`[DEBUG] Failed to refresh media URL:`, refreshError.message);
            }
          }
        }

        // For other errors or if we've exhausted retries on 403
        if (retryCount >= maxRetries) {
          break;
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

    // All retries failed
    console.error(`[DEBUG] All ${maxRetries} download attempts failed for message ${messageId}`);
    
    if (lastError?.response?.status === 403) {
      // For 403 errors that aren't expired, return a generic placeholder
      console.warn(`[DEBUG] Returning placeholder for inaccessible media (403)`);
      let mediaType = 'documentMessage'; // default
      for (const type of ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage']) {
        if (messageToUse.message?.[type]) {
          mediaType = type;
          break;
        }
      }
      
      const placeholder = createMediaPlaceholder(mediaType);
      return {
        mimeType: placeholder.mimeType,
        dataUrl: placeholder.dataUrl,
        expired: false,
        originalError: `Media access denied after ${maxRetries} attempts - possibly revoked or inaccessible`
      };
    }
    
    throw new Error(`Falha ao baixar mídia após ${maxRetries} tentativas: ${lastError?.message || 'Erro desconhecido'} (HTTP ${lastError?.response?.status || 'Unknown'})`);
  }

  static async deleteSessionCredentials(sessionId: string) {
    try {
      const authDir = path.resolve("auth", sessionId);
      
      if (existsSync(authDir)) {
        rmSync(authDir, { recursive: true, force: true });
        console.log(`[WhatsApp] Credentials deleted for session: ${sessionId}`);
      }
    } catch (error) {
      console.error(`[WhatsApp] Error deleting credentials for session ${sessionId}:`, error);
      throw error;
    }
  }

  static async closeSession(sessionId: string, deleteCredentials = false) {
    const sock = sessions.get(sessionId);

    if (sock) {
      await sock.logout();
      sessions.delete(sessionId);
    }

    rawMessages.delete(sessionId);
    
    // Delete credentials if requested
    if (deleteCredentials) {
      await this.deleteSessionCredentials(sessionId);
    }
    
    setState(sessionId, { status: "closed", qr: undefined });
  }

  static listSessions() {
    return Array.from(sessions.keys());
  }

  static listStoredSessions() {
    const authDir = path.resolve("auth");

    if (!existsSync(authDir)) {
      return [];
    }

    return readdirSync(authDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);
  }

  static getSessionState(sessionId: string): SessionState {
    const existing = sessionStates.get(sessionId);

    if (existing) {
      return existing;
    }

    const initialState: SessionState = {
      status: sessions.has(sessionId) ? "connected" : "idle",
      updatedAt: Date.now(),
    };

    sessionStates.set(sessionId, initialState);
    return initialState;
  }

  private static async reconnectSession(sessionId: string) {
    if (reconnecting.has(sessionId)) {
      return;
    }

    reconnecting.add(sessionId);
    try {
      await this.initSession(sessionId, true);
    } catch {
      setState(sessionId, { status: "connecting" });
    } finally {
      reconnecting.delete(sessionId);
    }
  }
}
