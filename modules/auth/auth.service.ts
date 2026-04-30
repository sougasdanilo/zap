import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { User, IUser } from '../../models/user.model'
import { env } from '../../config/env'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  username: string
  email: string
  password: string
}

export class AuthService {
  private static readonly JWT_SECRET = env.JWT_SECRET || 'default-secret-key'
  private static readonly JWT_EXPIRES_IN = '15m'
  private static readonly REFRESH_TOKEN_EXPIRES_IN = '7d'

  static async register(data: RegisterData): Promise<{ user: Omit<IUser, 'password'>; tokens: AuthTokens }> {
    console.log('AuthService.register called with:', data.username)
    
    const existingUser = await User.findOne({
      $or: [{ email: data.email }, { username: data.username }]
    })

    if (existingUser) {
      console.log('User already exists:', existingUser.email)
      throw new Error('Usuário ou email já existe')
    }

    console.log('Hashing password before creating user...')
    const salt = await bcrypt.genSalt(12)
    const hashedPassword = await bcrypt.hash(data.password, salt)
    
    // Generate unique session ID for this user
    const uniqueSessionId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    console.log('Creating new user with hashed password...')
    const user = new User({
      username: data.username,
      email: data.email,
      password: hashedPassword
    })
    
    console.log('User instance created, calling save...')
    await user.save()
    console.log('User saved successfully!')

    // Update user with unique session ID
    await this.updateWhatsAppCredentials(user._id.toString(), uniqueSessionId, false)

    const userWithoutPassword = this.removePasswordFromUser(user.toObject())
    const tokens = this.generateTokens(user._id.toString())

    return { user: userWithoutPassword, tokens }
  }

  static async login(credentials: LoginCredentials): Promise<{ user: Omit<IUser, 'password'>; tokens: AuthTokens }> {
    const user = await User.findOne({ email: credentials.email })

    if (!user || !(await user.comparePassword(credentials.password))) {
      throw new Error('Credenciais inválidas')
    }

    const userWithoutPassword = this.removePasswordFromUser(user.toObject())
    const tokens = this.generateTokens(user._id.toString())

    return { user: userWithoutPassword, tokens }
  }

  static async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, this.JWT_SECRET) as { userId: string }
      
      const user = await User.findById(decoded.userId)
      if (!user) {
        throw new Error('Usuário não encontrado')
      }

      return this.generateTokens(user._id.toString())
    } catch (error) {
      throw new Error('Token de refresh inválido')
    }
  }

  static async getUserById(userId: string): Promise<Omit<IUser, 'password'> | null> {
    const user = await User.findById(userId)
    if (!user) {
      return null
    }

    return this.removePasswordFromUser(user.toObject())
  }

  static async updateWhatsAppCredentials(userId: string, sessionId: string, connected: boolean): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      'whatsappCredentials.sessionId': sessionId,
      'whatsappCredentials.connected': connected,
      'whatsappCredentials.lastConnected': connected ? new Date() : undefined
    })
  }

  static async getUserWhatsAppCredentials(userId: string): Promise<{ sessionId: string; connected: boolean } | null> {
    const user = await User.findById(userId).select('whatsappCredentials')
    if (!user || !user.whatsappCredentials) {
      return null
    }

    return {
      sessionId: user.whatsappCredentials.sessionId,
      connected: user.whatsappCredentials.connected
    }
  }

  private static generateTokens(userId: string): AuthTokens {
    const accessToken = jwt.sign(
      { userId },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    )

    const refreshToken = jwt.sign(
      { userId },
      this.JWT_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRES_IN }
    )

    return { accessToken, refreshToken }
  }

  private static removePasswordFromUser(user: any): Omit<IUser, 'password'> {
    const { password, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  static verifyToken(token: string): { userId: string } {
    try {
      return jwt.verify(token, this.JWT_SECRET) as { userId: string }
    } catch (error) {
      throw new Error('Token inválido')
    }
  }
}
