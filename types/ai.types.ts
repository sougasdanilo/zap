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
  exitConditions?: {
    enabled: boolean;
    keywords: string[];
    phrases: string[];
    minMessages: number;
    maxMessages: number;
    inactivityMinutes: number;
    transferToHuman: boolean;
    exitMessage: string;
    confidenceThreshold: number;
    aiDetectionPrompt?: string;
    enableAIDetection: boolean;
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
    exitConditions: {
      enabled: true,
      keywords: ["humano", "atendente", "pessoa", "ajuda", "falar com alguém"],
      phrases: [
        "quero falar com um humano",
        "posso falar com um atendente",
        "gostaria de falar com alguém",
        "transferir para humano",
        "quero atendimento humano"
      ],
      minMessages: 3,
      maxMessages: 50,
      inactivityMinutes: 10,
      transferToHuman: true,
      exitMessage: "Vou transferir sua conversa para um atendente humano. Por favor, aguarde um momento.",
      confidenceThreshold: 0.8,
      aiDetectionPrompt: "Analise a mensagem do usuário e determine se ela indica um desejo claro de falar com um atendente humano. Responda apenas com 'SIM' ou 'NAO'.\n\nContexto: O usuário está conversando com um assistente de IA e pode querer ser transferido para um humano.\n\nMensagem: {message}\n\nResponda 'SIM' se a mensagem indicar desejo de atendimento humano, caso contrário responda 'NAO'.",
      enableAIDetection: false,
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
    exitConditions: input?.exitConditions
      ? {
          enabled: Boolean(input.exitConditions.enabled),
          keywords: Array.isArray(input.exitConditions.keywords)
            ? input.exitConditions.keywords
                .filter(k => typeof k === "string" && k.trim().length > 0)
                .map(k => k.trim().toLowerCase())
                .slice(0, 20)
            : defaults.exitConditions?.keywords || [],
          phrases: Array.isArray(input.exitConditions.phrases)
            ? input.exitConditions.phrases
                .filter(p => typeof p === "string" && p.trim().length > 0)
                .map(p => p.trim())
                .slice(0, 10)
            : defaults.exitConditions?.phrases || [],
          minMessages: Number.isFinite(Number(input.exitConditions.minMessages))
            ? Math.max(1, Math.min(20, Math.floor(Number(input.exitConditions.minMessages))))
            : defaults.exitConditions?.minMessages || 3,
          maxMessages: Number.isFinite(Number(input.exitConditions.maxMessages))
            ? Math.max(10, Math.min(200, Math.floor(Number(input.exitConditions.maxMessages))))
            : defaults.exitConditions?.maxMessages || 50,
          inactivityMinutes: Number.isFinite(Number(input.exitConditions.inactivityMinutes))
            ? Math.max(1, Math.min(60, Math.floor(Number(input.exitConditions.inactivityMinutes))))
            : defaults.exitConditions?.inactivityMinutes || 10,
          transferToHuman: Boolean(input.exitConditions.transferToHuman),
          exitMessage: String(input.exitConditions.exitMessage || defaults.exitConditions?.exitMessage || "")
            .trim() || defaults.exitConditions?.exitMessage || "",
          confidenceThreshold: Number.isFinite(Number(input.exitConditions.confidenceThreshold))
            ? Math.max(0.1, Math.min(1.0, Number(input.exitConditions.confidenceThreshold)))
            : defaults.exitConditions?.confidenceThreshold || 0.8,
          aiDetectionPrompt: String(input.exitConditions.aiDetectionPrompt || defaults.exitConditions?.aiDetectionPrompt || "")
            .trim() || defaults.exitConditions?.aiDetectionPrompt || "",
          enableAIDetection: typeof input.exitConditions.enableAIDetection === "boolean"
            ? input.exitConditions.enableAIDetection
            : defaults.exitConditions?.enableAIDetection || false,
        }
      : defaults.exitConditions,
  };
}
