import { Router } from 'express'
import { LLMService } from '../modules/llm/llm.service'

const router = Router()

// Testar conversa com IA
router.post('/test-conversation', async (req, res) => {
  try {
    const { messages } = req.body
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' })
    }
    
    const response = await LLMService.ask(messages)
    res.json({ response })
  } catch (error: any) {
    console.error('Error in AI test:', error)
    res.status(500).json({ 
      error: error.message || 'Erro ao processar mensagem com IA' 
    })
  }
})

export default router
