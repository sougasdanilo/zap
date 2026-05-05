import { AIConfigService } from "./ai.config.service";
import { ConversationService } from "../conversation/conversation.service";
import { LLMService } from "../llm/llm.service";
import type { AIConfig } from "../../types/ai.types";

export interface ExitDetectionResult {
  shouldExit: boolean;
  reason?: string;
  confidence: number;
  exitMessage?: string;
}

export class AIExitService {
  static async shouldExitAI(
    sessionId: string,
    jid: string,
    messageText: string,
  ): Promise<ExitDetectionResult> {
    const config = await AIConfigService.loadConfigBySession(sessionId);
    const exitConditions = config.exitConditions;

    if (!exitConditions?.enabled) {
      return { shouldExit: false, confidence: 0 };
    }

    const checks = [
      this.checkKeywords(messageText, exitConditions),
      this.checkPhrases(messageText, exitConditions),
      this.checkMessageCount(sessionId, jid, exitConditions),
      this.checkInactivity(sessionId, jid, exitConditions),
    ];

    if (exitConditions.enableAIDetection) {
      checks.push(this.checkAIDetection(sessionId, jid, messageText, exitConditions));
    }

    const results = await Promise.all(checks);

    const bestResult = results.reduce((best: ExitDetectionResult, current: ExitDetectionResult) => 
      current.confidence > best.confidence ? current : best
    );

    if (bestResult.shouldExit && bestResult.confidence >= exitConditions.confidenceThreshold) {
      return {
        ...bestResult,
        exitMessage: exitConditions.exitMessage,
      };
    }

    return { shouldExit: false, confidence: bestResult.confidence };
  }

  private static async checkKeywords(
    messageText: string,
    exitConditions: NonNullable<AIConfig["exitConditions"]>,
  ): Promise<ExitDetectionResult> {
    const normalizedText = messageText.toLowerCase();
    const matchedKeywords = exitConditions.keywords.filter(keyword => 
      normalizedText.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      const confidence = Math.min(0.9, 0.5 + (matchedKeywords.length * 0.1));
      return {
        shouldExit: true,
        reason: `Keywords detected: ${matchedKeywords.join(", ")}`,
        confidence,
      };
    }

    return { shouldExit: false, confidence: 0 };
  }

  private static async checkPhrases(
    messageText: string,
    exitConditions: NonNullable<AIConfig["exitConditions"]>,
  ): Promise<ExitDetectionResult> {
    const normalizedText = messageText.toLowerCase().trim();
    
    for (const phrase of exitConditions.phrases) {
      const normalizedPhrase = phrase.toLowerCase().trim();
      
      if (normalizedText === normalizedPhrase || 
          normalizedText.includes(normalizedPhrase) ||
          this.calculateSimilarity(normalizedText, normalizedPhrase) > 0.8) {
        return {
          shouldExit: true,
          reason: `Phrase matched: "${phrase}"`,
          confidence: 0.95,
        };
      }
    }

    return { shouldExit: false, confidence: 0 };
  }

  private static async checkMessageCount(
    sessionId: string,
    jid: string,
    exitConditions: NonNullable<AIConfig["exitConditions"]>,
  ): Promise<ExitDetectionResult> {
    try {
      const conversation = await ConversationService.getFilteredConversation(
        sessionId,
        jid,
        200,
      );

      const messageCount = conversation.filter(msg => msg.role === "user").length;

      if (messageCount >= exitConditions.maxMessages) {
        return {
          shouldExit: true,
          reason: `Maximum message count reached: ${messageCount}/${exitConditions.maxMessages}`,
          confidence: 0.8,
        };
      }

      if (messageCount < exitConditions.minMessages) {
        return { shouldExit: false, confidence: 0 };
      }

      return { shouldExit: false, confidence: 0.1 };
    } catch (error) {
      console.error("Error checking message count:", error);
      return { shouldExit: false, confidence: 0 };
    }
  }

  private static async checkInactivity(
    sessionId: string,
    jid: string,
    exitConditions: NonNullable<AIConfig["exitConditions"]>,
  ): Promise<ExitDetectionResult> {
    try {
      const conversation = await ConversationService.getFilteredConversation(
        sessionId,
        jid,
        10,
      );

      if (conversation.length === 0) {
        return { shouldExit: false, confidence: 0 };
      }

      const lastMessage = conversation[conversation.length - 1];
      const lastMessageTime = new Date(lastMessage.timestamp || Date.now());
      const currentTime = new Date();
      const inactiveMinutes = (currentTime.getTime() - lastMessageTime.getTime()) / (1000 * 60);

      if (inactiveMinutes >= exitConditions.inactivityMinutes) {
        return {
          shouldExit: true,
          reason: `Inactivity timeout: ${Math.floor(inactiveMinutes)} minutes`,
          confidence: Math.min(0.9, 0.5 + (inactiveMinutes / exitConditions.inactivityMinutes) * 0.4),
        };
      }

      return { shouldExit: false, confidence: 0 };
    } catch (error) {
      console.error("Error checking inactivity:", error);
      return { shouldExit: false, confidence: 0 };
    }
  }

  private static calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  static async markForHumanTransfer(
    sessionId: string,
    jid: string,
    reason: string,
  ): Promise<void> {
    try {
      await ConversationService.addMessage(
        sessionId,
        jid,
        "system",
        `[AI_EXIT] ${reason} - Marked for human transfer`
      );

      console.log(`Conversation ${jid} marked for human transfer: ${reason}`);
    } catch (error) {
      console.error("Error marking for human transfer:", error);
    }
  }

  private static async checkAIDetection(
    sessionId: string,
    jid: string,
    messageText: string,
    exitConditions: NonNullable<AIConfig["exitConditions"]>,
  ): Promise<ExitDetectionResult> {
    try {
      if (!exitConditions.aiDetectionPrompt || !exitConditions.enableAIDetection) {
        return { shouldExit: false, confidence: 0 };
      }

      // Preparar o prompt com a mensagem do usuário
      const prompt = exitConditions.aiDetectionPrompt.replace("{message}", messageText);

      // Criar uma conversação temporária para a detecção
      const detectionConversation = [
        {
          role: "system" as const,
          content: "Você é um analisador especializado em detectar quando usuários desejam atendimento humano.",
        },
        {
          role: "user" as const,
          content: prompt,
        },
      ];

      // Usar o LLMService para análise
      const response = await LLMService.ask(detectionConversation, { sessionId });

      // Analisar a resposta da IA
      const normalizedResponse = response.toLowerCase().trim();
      
      if (normalizedResponse === "sim" || normalizedResponse.includes("sim")) {
        return {
          shouldExit: true,
          reason: "AI detection: User wants human assistance",
          confidence: 0.95, // Alta confiança para detecção por IA
        };
      }

      return { shouldExit: false, confidence: 0 };
    } catch (error) {
      console.error("Error in AI detection:", error);
      return { shouldExit: false, confidence: 0 };
    }
  }
}
