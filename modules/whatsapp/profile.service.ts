import { WASocket } from "@whiskeysockets/baileys";
import { ChatStore } from "../chat/chat.store";
import type { ContactUpdate } from "../../types/message.types";

interface ProfileCache {
  url: string | null;
  timestamp: number;
}

class ProfileService {
  private cache: Map<string, ProfileCache> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  private isCacheValid(cache: ProfileCache): boolean {
    return Date.now() - cache.timestamp < this.CACHE_TTL;
  }

  private setCache(jid: string, url: string | null): void {
    this.cache.set(jid, {
      url,
      timestamp: Date.now(),
    });
  }

  private getCache(jid: string): string | null {
    const cached = this.cache.get(jid);
    if (cached && this.isCacheValid(cached)) {
      return cached.url;
    }
    this.cache.delete(jid);
    return null;
  }

  async getProfilePictureUrl(sessionId: string, jid: string): Promise<string | null> {
    // Verifica cache primeiro
    const cached = this.getCache(jid);
    if (cached !== null) {
      return cached;
    }

    // Verifica se já tem no ChatStore
    const chat = ChatStore.listChats(sessionId).find(chat => chat.jid === jid);
    if (chat?.profilePictureUrl !== undefined) {
      this.setCache(jid, chat.profilePictureUrl || null);
      return chat.profilePictureUrl || null;
    }

    return null;
  }

  async fetchProfilePicture(sessionId: string, socket: WASocket, jid: string): Promise<string | null> {
    try {
      const url = await socket.profilePictureUrl(jid);
      this.setCache(jid, url || null);
      
      // Atualiza no ChatStore
      ChatStore.setProfilePictureUrl(sessionId, jid, url || null);
      
      return url || null;
    } catch (error) {
      // Se não tiver foto de perfil, retorna null
      this.setCache(jid, null);
      ChatStore.setProfilePictureUrl(sessionId, jid, null);
      return null;
    }
  }

  async fetchMultipleProfilePictures(
    sessionId: string, 
    socket: WASocket, 
    jids: string[],
    concurrency: number = 5
  ): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();
    const batches: string[][] = [];
    
    // Divide em batches para controle de concorrência
    for (let i = 0; i < jids.length; i += concurrency) {
      batches.push(jids.slice(i, i + concurrency));
    }

    for (const batch of batches) {
      const promises = batch.map(async (jid) => {
        const cached = this.getCache(jid);
        if (cached !== null) {
          return { jid, url: cached };
        }

        try {
          const url = await socket.profilePictureUrl(jid);
          this.setCache(jid, url || null);
          ChatStore.setProfilePictureUrl(sessionId, jid, url || null);
          return { jid, url };
        } catch (error) {
          this.setCache(jid, null);
          ChatStore.setProfilePictureUrl(sessionId, jid, null);
          return { jid, url: null };
        }
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ jid, url }) => results.set(jid, url || null));
    }

    return results;
  }

  hasProfilePicture(sessionId: string, jid: string): boolean {
    const cached = this.getCache(jid);
    if (cached !== null) {
      return cached !== null;
    }

    const chat = ChatStore.listChats(sessionId).find(chat => chat.jid === jid);
    return !!chat?.profilePictureUrl;
  }

  invalidateCache(jid: string): void {
    this.cache.delete(jid);
  }

  clearCache(): void {
    this.cache.clear();
  }

  // Processa atualizações de contato para buscar fotos automaticamente
  async handleContactUpdate(
    sessionId: string, 
    socket: WASocket, 
    contact: ContactUpdate
  ): Promise<void> {
    const jids = [contact.jid, contact.id, contact.lid].filter(Boolean) as string[];
    
    for (const jid of jids) {
      if (jid && !this.getCache(jid)) {
        // Busca foto em background sem bloquear
        this.fetchProfilePicture(sessionId, socket, jid).catch(() => {
          // Ignora erros, é apenas background loading
        });
      }
    }
  }
}

export const profileService = new ProfileService();
