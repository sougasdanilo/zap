import mongoose, { Document, Schema } from 'mongoose'
import bcrypt from 'bcryptjs'
import type { UserPermission, UserRole, UserStatus } from '../types/access.types'
import {
  USER_PERMISSIONS,
  USER_ROLES,
  USER_STATUSES,
  getDefaultPermissionsForRole,
} from '../types/access.types'

export interface IUser extends Document {
  username: string
  fullName?: string | null
  email: string
  password: string
  tenantId?: mongoose.Types.ObjectId | null
  role: UserRole
  status: UserStatus
  permissions: UserPermission[]
  whatsappCredentials?: {
    sessionId: string
    connected: boolean
    lastConnected?: Date
  }
  lastLoginAt?: Date | null
  createdAt: Date
  updatedAt: Date
  comparePassword(candidatePassword: string): Promise<boolean>
}

const userSchema = new Schema<IUser>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  fullName: {
    type: String,
    default: null,
    trim: true,
    maxlength: 120
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true
  },
  role: {
    type: String,
    enum: USER_ROLES,
    default: 'collaborator'
  },
  status: {
    type: String,
    enum: USER_STATUSES,
    default: 'active'
  },
  permissions: {
    type: [String],
    enum: USER_PERMISSIONS,
    default: () => getDefaultPermissionsForRole('collaborator')
  },
  whatsappCredentials: {
    sessionId: {
      type: String,
      default: null
    },
    connected: {
      type: Boolean,
      default: false
    },
    lastConnected: {
      type: Date,
      default: null
    }
  },
  lastLoginAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
})

userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password)
}

export const User = mongoose.model<IUser>('User', userSchema)
