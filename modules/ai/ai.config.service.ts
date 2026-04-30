import axios from "axios";
import { Tenant } from "../../models/tenant.model";
import {
  type AIConfig,
  createDefaultAIConfig,
  sanitizeAIConfig,
} from "../../types/ai.types";

export type { AIConfig } from "../../types/ai.types";

export class AIConfigService {
  static async loadConfig(tenantId?: string): Promise<AIConfig> {
    if (!tenantId) {
      return createDefaultAIConfig();
    }

    const tenant = await Tenant.findById(tenantId)
      .select({ aiConfig: 1 })
      .lean()
      .exec();

    return sanitizeAIConfig((tenant?.aiConfig as Partial<AIConfig> | undefined) || undefined);
  }

  static async loadConfigBySession(sessionId: string): Promise<AIConfig> {
    const tenant = await Tenant.findOne({
      "whatsappCredentials.sessionId": sessionId,
    })
      .select({ aiConfig: 1 })
      .lean()
      .exec();

    return sanitizeAIConfig((tenant?.aiConfig as Partial<AIConfig> | undefined) || undefined);
  }

  static async saveConfig(tenantId: string, config: AIConfig): Promise<AIConfig> {
    const nextConfig = sanitizeAIConfig(config);

    await Tenant.updateOne(
      { _id: tenantId },
      {
        $set: {
          aiConfig: nextConfig,
        },
      },
    ).exec();

    return nextConfig;
  }

  static async testGoogleAIConnection(
    apiKey: string,
    model: string = "gemini-2.5-flash",
  ): Promise<boolean> {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              parts: [{ text: "Test connection" }],
            },
          ],
        },
        {
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      return response.status === 200 && response.data?.candidates?.length > 0;
    } catch (error: any) {
      console.error("Google AI connection test failed:", error.response?.data || error.message);
      return false;
    }
  }

  static async getGoogleAIModels(apiKey: string): Promise<string[]> {
    try {
      const response = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { timeout: 10000 },
      );

      return (
        response.data?.models
          ?.filter((model: any) =>
            model.supportedGenerationMethods?.includes("generateContent"),
          )
          ?.map((model: any) => model.name.split("/").pop()) || []
      );
    } catch (error) {
      console.error("Failed to fetch Google AI models:", error);
      return [];
    }
  }
}
