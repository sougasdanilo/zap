import { Router } from 'express'
import { AuthService } from '../modules/auth/auth.service'
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' })
    }

    if (!email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ error: 'Email inválido' })
    }

    const result = await AuthService.register({ username, email, password })
    
    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: result.user,
      tokens: result.tokens
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('já existe')) {
        return res.status(409).json({ error: error.message })
      }
      return res.status(400).json({ error: error.message })
    }
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' })
    }

    const result = await AuthService.login({ email, password })
    
    res.json({
      message: 'Login realizado com sucesso',
      user: result.user,
      tokens: result.tokens
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('inválidas')) {
        return res.status(401).json({ error: error.message })
      }
      return res.status(400).json({ error: error.message })
    }
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({ error: 'Token de refresh é obrigatório' })
    }

    const tokens = await AuthService.refreshToken(refreshToken)
    
    res.json({
      message: 'Tokens atualizados com sucesso',
      tokens
    })
  } catch (error) {
    if (error instanceof Error) {
      return res.status(401).json({ error: error.message })
    }
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id
    
    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' })
    }

    const user = await AuthService.getUserById(userId)
    
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' })
    }

    // Get user's WhatsApp session ID
    const whatsappCredentials = await AuthService.getUserWhatsAppCredentials(userId)

    res.json({ 
      user,
      sessionId: whatsappCredentials?.sessionId || `user-${userId}`
    })
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
