import axios from "axios";
import { AIConfig, AIConfigService } from "../ai/ai.config.service";

export class LLMService {
  static async ask(
    messages: any[],
    options: { tenantId?: string; sessionId?: string } = {},
  ): Promise<string> {
    const config = options.tenantId
      ? await AIConfigService.loadConfig(options.tenantId)
      : options.sessionId
        ? await AIConfigService.loadConfigBySession(options.sessionId)
        : await AIConfigService.loadConfig();

    if (config.provider === "google-ai" && config.googleAI) {
      return this.askGoogleAI(messages, config.googleAI);
    }

    throw new Error("Configuracao invalida - apenas Google AI e suportado");
  }

  static async askWithConfig(messages: any[], config: any): Promise<string> {
    if (config.provider === "google-ai" && config.googleAI) {
      return this.askGoogleAI(messages, config.googleAI);
    }

    throw new Error("Configuracao invalida para teste - apenas Google AI e suportado");
  }

  private static async askGoogleAI(
    messages: any[],
    config: AIConfig["googleAI"],
  ): Promise<string> {
    if (!config) {
      throw new Error("Configuracao do Google AI nao encontrada");
    }

    try {
      const systemMessage = messages.find((msg) => msg.role === "system");
      const otherMessages = messages.filter((msg) => msg.role !== "system");

      const googleAIMessages: any[] = [];

      if (systemMessage) {
        googleAIMessages.push({
          parts: [{ text: systemMessage.content }],
        });
      }

      otherMessages.forEach((msg) => {
        googleAIMessages.push({
          parts: [{ text: msg.content }],
        });
      });

      if (googleAIMessages.length === 0) {
        googleAIMessages.push({
          parts: [{ text: "Ola! Como posso ajudar?" }],
        });
      }

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
        {
          contents: googleAIMessages,
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
          },
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta";
    } catch (error) {
      console.error("Google AI API error:", error);
      throw new Error("Erro ao comunicar com Google AI");
    }
  }

  }
