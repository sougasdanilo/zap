import axios from 'axios'
import { AIConfig, AIConfigService } from '../ai/ai.config.service'

export class LLMService {
  private static config: AIConfig | null = null

  private static async getConfig(): Promise<AIConfig> {
    if (!this.config) {
      this.config = await AIConfigService.loadConfig()
    }
    return this.config
  }

  static async ask(messages: any[]): Promise<string> {
    const config = await this.getConfig()

    if (config.provider === 'google-ai' && config.googleAI) {
      return this.askGoogleAI(messages, config.googleAI)
    } else {
      throw new Error('Configuração inválida - apenas Google AI é suportado')
    }
  }

  static async askWithConfig(messages: any[], config: any): Promise<string> {
    if (config.provider === 'google-ai' && config.googleAI) {
      return this.askGoogleAI(messages, config.googleAI)
    } else {
      throw new Error('Configuração inválida para teste - apenas Google AI é suportado')
    }
  }

  private static async askGoogleAI(messages: any[], config: AIConfig['googleAI']): Promise<string> {
    if (!config) {
      throw new Error('Configuração do Google AI não encontrada')
    }

    try {
      // Google AI não suporta role 'system' diretamente, então tratamos o prompt como primeira mensagem
      const systemMessage = messages.find(msg => msg.role === 'system');
      const otherMessages = messages.filter(msg => msg.role !== 'system');
      
      // Se houver system prompt, coloca como primeira mensagem
      const googleAIMessages: any[] = [];
      
      if (systemMessage) {
        googleAIMessages.push({
          parts: [{ text: systemMessage.content }]
        });
      }
      
      // Adiciona as outras mensagens
      otherMessages.forEach(msg => {
        googleAIMessages.push({
          parts: [{ text: msg.content }]
        });
      });

      // Se não houver mensagens, cria uma mensagem inicial
      if (googleAIMessages.length === 0) {
        googleAIMessages.push({
          parts: [{ text: 'Olá! Como posso ajudar?' }]
        });
      }

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
        {
          contents: googleAIMessages,
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens
          }
        },
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta'
    } catch (error) {
      console.error('Google AI API error:', error)
      throw new Error('Erro ao comunicar com Google AI')
    }
  }

  static async reloadConfig(): Promise<void> {
    this.config = await AIConfigService.loadConfig()
  }
}