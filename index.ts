import express from 'express'
import sessionRoutes from './routes/session.routes'
import chatRoutes from './routes/chat.routes'
import aiConfigRoutes from './routes/ai-config.routes'
import aiConversationRoutes from './routes/ai-conversation.routes'
import aiTestRoutes from './routes/ai-test.routes'
import authRoutes from './routes/auth.routes'
import { AIConversationService } from './modules/ai/ai.conversation.service'
import { env } from './config/env'
import { database } from './config/database'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const publicDir = path.join(__dirname, 'public')

app.use(express.json({ limit: "100mb" }))
app.use('/api/auth', authRoutes)
app.use(sessionRoutes)
app.use(chatRoutes)
app.use('/api/ai', aiConfigRoutes)
app.use('/api/ai', aiConversationRoutes)
app.use('/api/ai', aiTestRoutes)
app.use(express.static(publicDir))

// Conectar ao MongoDB
database.connect().catch(console.error)

// Carrega status da IA ao iniciar
AIConversationService.loadStatus().catch(console.error)

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'))
})

app.get('/auth', (req, res) => {
  res.sendFile(path.join(publicDir, 'auth.html'))
})

app.listen(env.PORT, () => {
  console.log(`Servidor rodando na porta ${env.PORT}`)
})
