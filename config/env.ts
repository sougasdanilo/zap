import dotenv from 'dotenv'

// Carrega variáveis de ambiente do arquivo .env
dotenv.config()

export const env = {
  PORT: process.env.PORT || 3002,
  JWT_SECRET: process.env.JWT_SECRET,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-bot'
}