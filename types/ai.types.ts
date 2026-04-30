export interface AIConfig {
  provider: "google-ai";
  googleAI?: {
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  botContext?: {
    systemPrompt: string;
    maxHistoryLength: number;
  };
  groupSettings?: {
    enabled: boolean;
    respondToMentions: boolean;
    respondToCommands: boolean;
    commandPrefix: string;
  };
}

export function createDefaultAIConfig(): AIConfig {
  return {
    provider: "google-ai",
    botContext: {
      systemPrompt:
        "Voce e um atendente profissional.\nResponda de forma objetiva.\nNunca invente informacoes.",
      maxHistoryLength: 20,
    },
    groupSettings: {
      enabled: false,
      respondToMentions: true,
      respondToCommands: true,
      commandPrefix: "!",
    },
  };
}

export function sanitizeAIConfig(input?: Partial<AIConfig> | null): AIConfig {
  const defaults = createDefaultAIConfig();

  return {
    provider: "google-ai",
    googleAI: input?.googleAI
      ? {
          apiKey: String(input.googleAI.apiKey || ""),
          model: String(input.googleAI.model || "gemini-2.5-flash"),
          temperature: Number.isFinite(Number(input.googleAI.temperature))
            ? Number(input.googleAI.temperature)
            : 0.7,
          maxTokens: Number.isFinite(Number(input.googleAI.maxTokens))
            ? Number(input.googleAI.maxTokens)
            : 2048,
        }
      : undefined,
    botContext: {
      systemPrompt:
        String(input?.botContext?.systemPrompt || defaults.botContext?.systemPrompt || "").trim() ||
        defaults.botContext?.systemPrompt ||
        "",
      maxHistoryLength: Number.isFinite(Number(input?.botContext?.maxHistoryLength))
        ? Math.max(5, Math.min(100, Math.floor(Number(input?.botContext?.maxHistoryLength))))
        : defaults.botContext?.maxHistoryLength || 20,
    },
    groupSettings: {
      enabled: Boolean(input?.groupSettings?.enabled),
      respondToMentions:
        typeof input?.groupSettings?.respondToMentions === "boolean"
          ? input.groupSettings.respondToMentions
          : defaults.groupSettings?.respondToMentions || true,
      respondToCommands:
        typeof input?.groupSettings?.respondToCommands === "boolean"
          ? input.groupSettings.respondToCommands
          : defaults.groupSettings?.respondToCommands || true,
      commandPrefix:
        String(input?.groupSettings?.commandPrefix || defaults.groupSettings?.commandPrefix || "!")
          .trim()
          .slice(0, 5) || "!",
    },
  };
}
