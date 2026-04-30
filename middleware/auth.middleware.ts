import { Request, Response, NextFunction } from 'express'
import { AuthService } from '../modules/auth/auth.service'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
  }
}

export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({ error: 'Token de acesso não fornecido' })
    }

    const decoded = AuthService.verifyToken(token)
    req.user = { id: decoded.userId }

    next()
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}

export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (token) {
      const decoded = AuthService.verifyToken(token)
      req.user = { id: decoded.userId }
    }

    next()
  } catch (error) {
    next()
  }
}
