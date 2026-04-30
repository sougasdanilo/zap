import { AIConfigService } from '../ai/ai.config.service'

type Message = {
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp?: number
}

const conversations: Record<string, Message[]> = {}
const lastActivity: Record<string, number> = {}

export class ConversationService {
  static async getFilteredConversation(jid: string, maxContextMessages: number = 10): Promise<Message[]> {
    const fullConversation = await this.getConversation(jid)
    
    // Se não houver muitas mensagens, retorna tudo
    if (fullConversation.length <= maxContextMessages + 1) {
      return fullConversation
    }
    
    // Sempre inclui o system prompt
    const systemMessage = fullConversation.find(msg => msg.role === 'system')
    const recentMessages = fullConversation
      .filter(msg => msg.role !== 'system')
      .slice(-maxContextMessages)
    
    return systemMessage ? [systemMessage, ...recentMessages] : recentMessages
  }

  static async getConversation(jid: string): Promise<Message[]> {
    if (!conversations[jid]) {
      const config = await AIConfigService.loadConfig()
      conversations[jid] = [
        { role: 'system', content: config.botContext?.systemPrompt || 'Você é um atendente profissional.' }
      ]
      lastActivity[jid] = Date.now()
    }

    return conversations[jid]
  }

  static async addMessage(jid: string, role: Message['role'], content: string): Promise<void> {
    const config = await AIConfigService.loadConfig()
    
    // Garante que a conversa existe
    if (!conversations[jid]) {
      conversations[jid] = [
        { role: 'system', content: config.botContext?.systemPrompt || 'Você é um atendente profissional.' }
      ]
    }
    
    conversations[jid].push({ role, content, timestamp: Date.now() })
    lastActivity[jid] = Date.now()

    // Limita histórico conforme configuração
    const maxHistory = config.botContext?.maxHistoryLength || 20
    if (conversations[jid].length > maxHistory) {
      conversations[jid] = [
        conversations[jid][0],
        ...conversations[jid].slice(-(maxHistory - 1))
      ]
    }
  }

  static clearConversation(jid: string) {
    delete conversations[jid]
    delete lastActivity[jid]
  }

  static getConversationStats(jid: string) {
    const conversation = conversations[jid] || []
    const userMessages = conversation.filter(msg => msg.role === 'user').length
    const assistantMessages = conversation.filter(msg => msg.role === 'assistant').length
    const lastActivityTime = lastActivity[jid]
    
    return {
      userMessages,
      assistantMessages,
      totalMessages: conversation.length,
      lastActivity: lastActivityTime ? new Date(lastActivityTime) : null
    }
  }
}