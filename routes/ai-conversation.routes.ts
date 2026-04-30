import { Router } from 'express'
import { AIConversationService } from '../modules/ai/ai.conversation.service'

const router = Router()

// Obter status da IA
router.get('/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params
    const status = AIConversationService.getAIStatus(sessionId)
    res.json(status)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter status da IA' })
  }
})

// Habilitar/Desabilitar IA
router.post('/toggle/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params
    const status = await AIConversationService.toggleAI(sessionId)
    
    const message = status.enabled 
      ? '🤖 IA habilitada com sucesso! O bot responderá automaticamente às mensagens.'
      : '🔇 IA desabilitada. O bot não responderá automaticamente.'
    
    res.json({ 
      ...status, 
      message 
    })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar status da IA' })
  }
})

// Habilitar IA
router.post('/enable/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params
    await AIConversationService.enableAI(sessionId)
    res.json({ 
      enabled: true, 
      message: '🤖 IA habilitada com sucesso! O bot responderá automaticamente às mensagens.'
    })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao habilitar IA' })
  }
})

// Desabilitar IA
router.post('/disable/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params
    await AIConversationService.disableAI(sessionId)
    res.json({ 
      enabled: false, 
      message: '🔇 IA desabilitada. O bot não responderá automaticamente.'
    })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao desabilitar IA' })
  }
})

export default router
