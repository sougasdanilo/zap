import { LLMService } from "../llm/llm.service";
import { ConversationService } from "../conversation/conversation.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { AIConfigService } from "./ai.config.service";
import type { SendMessagePayload } from "../../types/message.types";
import { TenantService } from "../tenant/tenant.service";

export interface AIResponse {
  text: string;
  shouldRespond: boolean;
}

export class AIConversationService {
  static async loadStatus(): Promise<void> {
    return;
  }

  static async enableAI(sessionId: string) {
    const tenant = await TenantService.getTenantBySessionId(sessionId);
    if (!tenant) {
      throw new Error("Tenant nao encontrado para a sessao");
    }

    tenant.aiEnabled = true;
    await tenant.save();
    console.log(`AI enabled for session ${sessionId}`);
  }

  static async disableAI(sessionId: string) {
    const tenant = await TenantService.getTenantBySessionId(sessionId);
    if (!tenant) {
      throw new Error("Tenant nao encontrado para a sessao");
    }

    tenant.aiEnabled = false;
    await tenant.save();
    console.log(`AI disabled for session ${sessionId}`);
  }

  static async isAIEnabled(sessionId: string): Promise<boolean> {
    const tenant = await TenantService.getTenantBySessionId(sessionId);
    return !!tenant?.aiEnabled;
  }

  private static isGroupJid(jid: string): boolean {
    return jid.endsWith("@g.us");
  }

  private static isCommand(text: string, prefix: string): boolean {
    return text.trim().startsWith(prefix);
  }

  static async processIncomingMessage(
    sessionId: string,
    jid: string,
    text: string,
  ): Promise<void> {
    console.log(`Processing message: sessionId=${sessionId}, jid=${jid}, text="${text}"`);

    if (!(await this.isAIEnabled(sessionId))) {
      console.log(`AI disabled for session ${sessionId}`);
      return;
    }

    if (!text || text.trim().length === 0) {
      console.log("Empty message, ignoring");
      return;
    }

    const isGroup = this.isGroupJid(jid);
    if (isGroup) {
      const config = await AIConfigService.loadConfigBySession(sessionId);
      const groupSettings = config.groupSettings;

      if (!groupSettings?.enabled) {
        console.log("AI disabled for groups");
        return;
      }

      const shouldRespondToMentions = groupSettings.respondToMentions;
      const shouldRespondToCommands = groupSettings.respondToCommands;
      const commandPrefix = groupSettings.commandPrefix;
      const isCommand = this.isCommand(text, commandPrefix);

      if (!shouldRespondToCommands && !shouldRespondToMentions) {
        console.log("AI not configured to respond in groups");
        return;
      }

      if (!isCommand && !shouldRespondToMentions) {
        console.log("Message does not match group response criteria");
        return;
      }
    }

    try {
      await ConversationService.addMessage(sessionId, jid, "user", text);
      const conversation = await ConversationService.getFilteredConversation(
        sessionId,
        jid,
        10,
      );
      const response = await LLMService.ask(conversation, { sessionId });

      await ConversationService.addMessage(sessionId, jid, "assistant", response);

      const payload: SendMessagePayload = {
        jid,
        text: response,
        type: "text",
      };

      await WhatsAppService.sendMessage(sessionId, payload);
    } catch (error) {
      console.error("Error processing message with AI:", error);

      const errorPayload: SendMessagePayload = {
        jid,
        text: "Desculpe, tive um problema ao processar sua mensagem. Tente novamente.",
        type: "text",
      };

      await WhatsAppService.sendMessage(sessionId, errorPayload);
    }
  }

  static async getAIStatus(sessionId: string): Promise<{ enabled: boolean }> {
    return {
      enabled: await this.isAIEnabled(sessionId),
    };
  }

  static async toggleAI(sessionId: string): Promise<{ enabled: boolean }> {
    if (await this.isAIEnabled(sessionId)) {
      await this.disableAI(sessionId);
      return { enabled: false };
    }

    await this.enableAI(sessionId);
    return { enabled: true };
  }
}
