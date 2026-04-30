import { Router } from 'express'
import { WhatsAppService } from '../modules/whatsapp/whatsapp.service'
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware'

const router = Router()

router.post('/session/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params
  const userId = req.user?.id

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'ID de sessão inválido' })
  }

  await WhatsAppService.initSession(id)

  res.json({
    message: `Sessão ${id} iniciada`,
    state: WhatsAppService.getSessionState(id)
  })
})

router.get('/sessions', authenticateToken, (req: AuthenticatedRequest, res) => {
  res.json({
    active: WhatsAppService.listSessions(),
    stored: WhatsAppService.listStoredSessions()
  })
})

router.get('/session/:id/status', authenticateToken, (req: AuthenticatedRequest, res) => {
  const { id } = req.params

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'ID de sessão inválido' })
  }

  res.json({
    id,
    state: WhatsAppService.getSessionState(id)
  })
})

router.delete('/session/:id', async (req, res) => {
  const { id } = req.params
  const { deleteCredentials } = req.query

  await WhatsAppService.closeSession(id, deleteCredentials === 'true')

  res.json({ 
    message: deleteCredentials === 'true' 
      ? `Sessão ${id} encerrada e credenciais excluídas` 
      : `Sessão ${id} encerrada`
  })
})

router.delete('/session/:id/credentials', async (req, res) => {
  const { id } = req.params

  await WhatsAppService.deleteSessionCredentials(id)

  res.json({ message: `Credenciais da sessão ${id} excluídas` })
})

export default router
