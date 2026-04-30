import dotenv from 'dotenv'

// Carrega variáveis de ambiente do arquivo .env
dotenv.config()

export const env = {
  PORT: process.env.PORT || 3002,
  LM_STUDIO_URL: process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234/v1/chat/completions',
  MODEL: process.env.MODEL || 'local-model',
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || '',
  CONFIG_FILE: process.env.CONFIG_FILE || './config/ai-config.json',
  JWT_SECRET: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-bot'
}