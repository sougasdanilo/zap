import { Router } from 'express'
import { AIConfigService } from '../modules/ai/ai.config.service'
import { LLMService } from '../modules/llm/llm.service'

const router = Router()

// Obter configuração atual
router.get('/config', async (req, res) => {
  try {
    const config = await AIConfigService.loadConfig()
    // Não retornar a API key por segurança
    const safeConfig = {
      ...config,
      googleAI: config.googleAI ? {
        ...config.googleAI,
        apiKey: config.googleAI.apiKey ? '***' : ''
      } : undefined
    }
    res.json(safeConfig)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar configuração' })
  }
})

// Salvar configuração
router.post('/config', async (req, res) => {
  try {
    const config = req.body
    
    // Validar configuração
    if (config.provider === 'google-ai' && !config.googleAI?.apiKey) {
      return res.status(400).json({ error: 'API Key do Google AI é obrigatória' })
    }
    
    // Validar configurações de contexto do bot
    if (config.botContext) {
      if (config.botContext.maxHistoryLength && (config.botContext.maxHistoryLength < 5 || config.botContext.maxHistoryLength > 100)) {
        return res.status(400).json({ error: 'Tamanho máximo do histórico deve estar entre 5 e 100' })
      }
    }
    
    // Validar configurações de grupos
    if (config.groupSettings) {
      if (config.groupSettings.commandPrefix && config.groupSettings.commandPrefix.length > 5) {
        return res.status(400).json({ error: 'Prefixo de comando deve ter no máximo 5 caracteres' })
      }
      
      if (config.groupSettings.commandPrefix && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(config.groupSettings.commandPrefix)) {
        return res.status(400).json({ error: 'Prefixo de comando deve ser um caractere especial' })
      }
    }
    
    await AIConfigService.saveConfig(config)
    await LLMService.reloadConfig()
    
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar configuração' })
  }
})

// Testar conexão com Google AI
router.post('/test-google-ai', async (req, res) => {
  try {
    const { apiKey, model = 'gemini-2.5-flash' } = req.body
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API Key é obrigatória' })
    }
    
    const isValid = await AIConfigService.testGoogleAIConnection(apiKey, model)
    res.json({ valid: isValid })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao testar conexão' })
  }
})

// Obter modelos disponíveis do Google AI
router.post('/google-ai-models', async (req, res) => {
  try {
    const { apiKey } = req.body
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API Key é obrigatória' })
    }
    
    const models = await AIConfigService.getGoogleAIModels(apiKey)
    res.json({ models })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter modelos' })
  }
})

// Testar chat do bot com configuração atual
router.post('/test-chat', async (req, res) => {
  try {
    const { message, config } = req.body
    
    if (!message || !config) {
      return res.status(400).json({ error: 'Mensagem e configuração são obrigatórios' })
    }
    
    // Validar configuração
    if (config.provider === 'google-ai' && !config.googleAI?.apiKey) {
      return res.status(400).json({ error: 'API Key do Google AI é obrigatória' })
    }
    
    // Criar conversa temporária para teste
    const tempConversation = [
      { role: 'system', content: config.systemPrompt || 'Você é um atendente profissional.' },
      { role: 'user', content: message }
    ]
    
    // Usar LLMService temporariamente com a configuração fornecida
    const response = await LLMService.askWithConfig(tempConversation, config)
    
    res.json({ response })
  } catch (error) {
    console.error('Error testing chat:', error)
    res.status(500).json({ error: 'Erro ao processar mensagem de teste' })
  }
})

export default router
