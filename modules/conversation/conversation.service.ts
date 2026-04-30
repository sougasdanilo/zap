import { AIConfigService } from "../ai/ai.config.service";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp?: number;
};

const conversations: Record<string, Message[]> = {};
const lastActivity: Record<string, number> = {};

function buildConversationKey(sessionId: string, jid: string): string {
  return `${sessionId}::${jid}`;
}

export class ConversationService {
  static async getFilteredConversation(
    sessionId: string,
    jid: string,
    maxContextMessages: number = 10,
  ): Promise<Message[]> {
    const fullConversation = await this.getConversation(sessionId, jid);

    if (fullConversation.length <= maxContextMessages + 1) {
      return fullConversation;
    }

    const systemMessage = fullConversation.find((msg) => msg.role === "system");
    const recentMessages = fullConversation
      .filter((msg) => msg.role !== "system")
      .slice(-maxContextMessages);

    return systemMessage ? [systemMessage, ...recentMessages] : recentMessages;
  }

  static async getConversation(sessionId: string, jid: string): Promise<Message[]> {
    const key = buildConversationKey(sessionId, jid);

    if (!conversations[key]) {
      const config = await AIConfigService.loadConfigBySession(sessionId);
      conversations[key] = [
        {
          role: "system",
          content:
            config.botContext?.systemPrompt || "Voce e um atendente profissional.",
        },
      ];
      lastActivity[key] = Date.now();
    }

    return conversations[key];
  }

  static async addMessage(
    sessionId: string,
    jid: string,
    role: Message["role"],
    content: string,
  ): Promise<void> {
    const key = buildConversationKey(sessionId, jid);
    const config = await AIConfigService.loadConfigBySession(sessionId);

    if (!conversations[key]) {
      conversations[key] = [
        {
          role: "system",
          content:
            config.botContext?.systemPrompt || "Voce e um atendente profissional.",
        },
      ];
    }

    conversations[key].push({ role, content, timestamp: Date.now() });
    lastActivity[key] = Date.now();

    const maxHistory = config.botContext?.maxHistoryLength || 20;
    if (conversations[key].length > maxHistory) {
      conversations[key] = [
        conversations[key][0],
        ...conversations[key].slice(-(maxHistory - 1)),
      ];
    }
  }

  static clearConversation(sessionId: string, jid: string) {
    const key = buildConversationKey(sessionId, jid);
    delete conversations[key];
    delete lastActivity[key];
  }

  static getConversationStats(sessionId: string, jid: string) {
    const key = buildConversationKey(sessionId, jid);
    const conversation = conversations[key] || [];
    const userMessages = conversation.filter((msg) => msg.role === "user").length;
    const assistantMessages = conversation.filter((msg) => msg.role === "assistant").length;
    const lastActivityTime = lastActivity[key];

    return {
      userMessages,
      assistantMessages,
      totalMessages: conversation.length,
      lastActivity: lastActivityTime ? new Date(lastActivityTime) : null,
    };
  }
}
