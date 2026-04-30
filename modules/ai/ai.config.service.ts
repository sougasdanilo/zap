import fs from 'fs/promises'
import path from 'path'
import { env } from '../../config/env'
import axios from 'axios'

export interface AIConfig {
  provider: 'google-ai'
  googleAI?: {
    apiKey: string
    model: string
    temperature: number
    maxTokens: number
  }
  botContext?: {
    systemPrompt: string
    maxHistoryLength: number
  }
  groupSettings?: {
    enabled: boolean
    respondToMentions: boolean
    respondToCommands: boolean
    commandPrefix: string
  }
}

export class AIConfigService {
  private static configPath = path.resolve(env.CONFIG_FILE)
  
  static async loadConfig(): Promise<AIConfig> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      // Configuração padrão se arquivo não existir
      return {
        provider: 'google-ai',
        botContext: {
          systemPrompt: `Você é um atendente profissional.\nResponda de forma objetiva.\nNunca invente informações.`,
          maxHistoryLength: 20
        },
        groupSettings: {
          enabled: false,
          respondToMentions: true,
          respondToCommands: true,
          commandPrefix: '!'
        }
      }
    }
  }

  static async saveConfig(config: AIConfig): Promise<void> {
    const configDir = path.dirname(this.configPath)
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2))
  }

  static async testGoogleAIConnection(apiKey: string, model: string = 'gemini-2.5-flash'): Promise<boolean> {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [{
            parts: [{
              text: "Test connection"
            }]
          }]
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
      
      return response.status === 200 && response.data?.candidates?.length > 0
    } catch (error: any) {
      console.error('Google AI connection test failed:', error.response?.data || error.message)
      
      // Retornar false para qualquer erro, incluindo API key inválida
      return false
    }
  }

  static async getGoogleAIModels(apiKey: string): Promise<string[]> {
    try {
      const response = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { timeout: 10000 }
      )
      
      return response.data?.models
        ?.filter((model: any) => model.supportedGenerationMethods?.includes('generateContent'))
        ?.map((model: any) => model.name.split('/').pop()) || []
    } catch (error) {
      console.error('Failed to fetch Google AI models:', error)
      return []
    }
  }
}
