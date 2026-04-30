import { LLMService } from '../llm/llm.service'
import { ConversationService } from '../conversation/conversation.service'
import { WhatsAppService } from '../whatsapp/whatsapp.service'
import { AIConfigService } from './ai.config.service'
import type { SendMessagePayload } from '../../types/message.types'
import fs from 'fs/promises'
import path from 'path'

export interface AIResponse {
  text: string
  shouldRespond: boolean
}

export class AIConversationService {
  private static enabledSessions: Set<string> = new Set()
  private static statusFile = './config/ai-status.json'
  
  static async loadStatus(): Promise<void> {
    try {
      const data = await fs.readFile(this.statusFile, 'utf-8')
      const status = JSON.parse(data)
      this.enabledSessions = new Set(status.enabledSessions || [])
      console.log(`📂 Loaded AI status for ${this.enabledSessions.size} sessions`)
    } catch (error) {
      // Arquivo não existe, cria com status vazio
      this.enabledSessions = new Set()
      await this.saveStatus()
    }
  }
  
  private static async saveStatus(): Promise<void> {
    try {
      const status = {
        enabledSessions: Array.from(this.enabledSessions)
      }
      await fs.writeFile(this.statusFile, JSON.stringify(status, null, 2))
    } catch (error) {
      console.error('Error saving AI status:', error)
    }
  }
  
  static async enableAI(sessionId: string) {
    this.enabledSessions.add(sessionId)
    await this.saveStatus()
    console.log(`✅ AI enabled for session ${sessionId}`)
  }
  
  static async disableAI(sessionId: string) {
    this.enabledSessions.delete(sessionId)
    await this.saveStatus()
    console.log(`❌ AI disabled for session ${sessionId}`)
  }
  
  static isAIEnabled(sessionId: string): boolean {
    return this.enabledSessions.has(sessionId)
  }
  
  private static isGroupJid(jid: string): boolean {
    return jid.endsWith('@g.us')
  }

  private static isMention(text: string, botNumber: string): boolean {
    const mention = `@${botNumber.replace('@s.whatsapp.net', '')}`
    return text.includes(mention)
  }

  private static isCommand(text: string, prefix: string): boolean {
    return text.trim().startsWith(prefix)
  }

  static async processIncomingMessage(sessionId: string, jid: string, text: string): Promise<void> {
    console.log(`🔍 Processing message: sessionId=${sessionId}, jid=${jid}, text="${text}"`)
    
    // Verifica se IA está habilitada para esta sessão
    if (!this.isAIEnabled(sessionId)) {
      console.log(`❌ AI disabled for session ${sessionId}`)
      return
    }
    
    // Ignora mensagens vazias ou apenas mídia
    if (!text || text.trim().length === 0) {
      console.log(`❌ Empty message, ignoring`)
      return
    }

    // Verifica se é mensagem de grupo
    const isGroup = this.isGroupJid(jid)
    if (isGroup) {
      console.log(`👥 Message from group: ${jid}`)
      
      // Carrega configuração de grupos
      const config = await AIConfigService.loadConfig()
      const groupSettings = config.groupSettings
      
      // Se IA para grupos estiver desabilitada, ignora
      if (!groupSettings?.enabled) {
        console.log(`❌ AI disabled for groups`)
        return
      }
      
      // Verifica se deve responder a menções ou comandos
      const shouldRespondToMentions = groupSettings.respondToMentions
      const shouldRespondToCommands = groupSettings.respondToCommands
      const commandPrefix = groupSettings.commandPrefix
      
      // Para obter o número do bot, precisamos da sessão do WhatsApp
      // Por ora, vamos verificar apenas comandos
      const isCommand = this.isCommand(text, commandPrefix)
      
      if (!shouldRespondToCommands && !shouldRespondToMentions) {
        console.log(`❌ AI not configured to respond in groups`)
        return
      }
      
      if (shouldRespondToCommands && isCommand) {
        console.log(`✅ Command detected, processing...`)
      } else if (shouldRespondToMentions) {
        // TODO: Implementar verificação de menções quando tivermos acesso ao número do bot
        console.log(`⚠️ Mention checking not implemented yet, processing anyway...`)
      } else {
        console.log(`❌ Message doesn't match group response criteria`)
        return
      }
    }
    
    console.log(`✅ Processing message with AI...`)
    
    try {
      // Adiciona mensagem do usuário à conversa
      await ConversationService.addMessage(jid, 'user', text)
      
      // Obtém o histórico filtrado da conversa (contexto relevante)
      const conversation = await ConversationService.getFilteredConversation(jid, 10)
      console.log(`📝 Sending ${conversation.length} messages to AI (filtered context)`)
      
      // Envia para a IA processar
      const response = await LLMService.ask(conversation)
      console.log(`🤖 AI response: "${response}"`)
      
      // Adiciona resposta da IA à conversa
      await ConversationService.addMessage(jid, 'assistant', response)
      
      // Envia resposta de volta para o WhatsApp
      const payload: SendMessagePayload = {
        jid,
        text: response,
        type: 'text'
      }
      
      await WhatsAppService.sendMessage(sessionId, payload)
      
      console.log(`✅ AI response sent to ${jid}${isGroup ? ' (group)' : ''}`)
      
    } catch (error) {
      console.error('❌ Error processing message with AI:', error)
      
      // Envia mensagem de erro opcional
      const errorPayload: SendMessagePayload = {
        jid,
        text: 'Desculpe, tive um problema ao processar sua mensagem. Tente novamente.',
        type: 'text'
      }
      
      await WhatsAppService.sendMessage(sessionId, errorPayload)
      console.log(`📤 Error message sent to ${jid}${isGroup ? ' (group)' : ''}`)
    }
  }
  
  static getAIStatus(sessionId: string): { enabled: boolean } {
    return {
      enabled: this.isAIEnabled(sessionId)
    }
  }
  
  static async toggleAI(sessionId: string): Promise<{ enabled: boolean }> {
    if (this.isAIEnabled(sessionId)) {
      await this.disableAI(sessionId)
      return { enabled: false }
    } else {
      await this.enableAI(sessionId)
      return { enabled: true }
    }
  }
}
