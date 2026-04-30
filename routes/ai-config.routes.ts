import { Router } from "express";
import { AIConfigService } from "../modules/ai/ai.config.service";
import { LLMService } from "../modules/llm/llm.service";
import {
  authenticateToken,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/config",
  authenticateToken,
  requirePermission("ai:manage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Usuario nao autenticado" });
      }

      const config = await AIConfigService.loadConfig(tenantId);
      const safeConfig = {
        ...config,
        googleAI: config.googleAI
          ? {
              ...config.googleAI,
              apiKey: config.googleAI.apiKey ? "***" : "",
            }
          : undefined,
      };
      res.json(safeConfig);
    } catch (error) {
      res.status(500).json({ error: "Erro ao carregar configuracao" });
    }
  },
);

router.post(
  "/config",
  authenticateToken,
  requirePermission("ai:manage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: "Usuario nao autenticado" });
      }

      const config = req.body;
      const currentConfig = await AIConfigService.loadConfig(tenantId);

      if (
        config.provider === "google-ai" &&
        currentConfig.googleAI?.apiKey &&
        (!config.googleAI || !String(config.googleAI.apiKey || "").trim())
      ) {
        config.googleAI = {
          ...(config.googleAI || {}),
          apiKey: currentConfig.googleAI.apiKey,
        };
      }

      if (config.provider === "google-ai" && !config.googleAI?.apiKey) {
        return res.status(400).json({ error: "API Key do Google AI e obrigatoria" });
      }

      if (
        config.botContext?.maxHistoryLength &&
        (config.botContext.maxHistoryLength < 5 || config.botContext.maxHistoryLength > 100)
      ) {
        return res.status(400).json({
          error: "Tamanho maximo do historico deve estar entre 5 e 100",
        });
      }

      if (config.groupSettings?.commandPrefix && config.groupSettings.commandPrefix.length > 5) {
        return res.status(400).json({
          error: "Prefixo de comando deve ter no maximo 5 caracteres",
        });
      }

      if (
        config.groupSettings?.commandPrefix &&
        !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(config.groupSettings.commandPrefix)
      ) {
        return res.status(400).json({
          error: "Prefixo de comando deve ser um caractere especial",
        });
      }

      await AIConfigService.saveConfig(tenantId, config);
      await LLMService.reloadConfig();

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao salvar configuracao" });
    }
  },
);

router.post(
  "/test-google-ai",
  authenticateToken,
  requirePermission("ai:manage"),
  async (req, res) => {
    try {
      const { apiKey, model = "gemini-2.5-flash" } = req.body;

      if (!apiKey) {
        return res.status(400).json({ error: "API Key e obrigatoria" });
      }

      const isValid = await AIConfigService.testGoogleAIConnection(apiKey, model);
      res.json({ valid: isValid });
    } catch (error) {
      res.status(500).json({ error: "Erro ao testar conexao" });
    }
  },
);

router.post(
  "/google-ai-models",
  authenticateToken,
  requirePermission("ai:manage"),
  async (req, res) => {
    try {
      const { apiKey } = req.body;

      if (!apiKey) {
        return res.status(400).json({ error: "API Key e obrigatoria" });
      }

      const models = await AIConfigService.getGoogleAIModels(apiKey);
      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: "Erro ao obter modelos" });
    }
  },
);

router.post(
  "/test-chat",
  authenticateToken,
  requirePermission("ai:manage"),
  async (req, res) => {
    try {
      const { message, config } = req.body;

      if (!message || !config) {
        return res.status(400).json({ error: "Mensagem e configuracao sao obrigatorias" });
      }

      if (config.provider === "google-ai" && !config.googleAI?.apiKey) {
        return res.status(400).json({ error: "API Key do Google AI e obrigatoria" });
      }

      const tempConversation = [
        {
          role: "system",
          content: config.systemPrompt || "Voce e um atendente profissional.",
        },
        { role: "user", content: message },
      ];

      const response = await LLMService.askWithConfig(tempConversation, config);
      res.json({ response });
    } catch (error) {
      console.error("Error testing chat:", error);
      res.status(500).json({ error: "Erro ao processar mensagem de teste" });
    }
  },
);

export default router;
