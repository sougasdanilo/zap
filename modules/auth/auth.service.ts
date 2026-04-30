import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User, type IUser } from "../../models/user.model";
import { type ITenant } from "../../models/tenant.model";
import { env } from "../../config/env";
import { TenantService } from "../tenant/tenant.service";
import { getDefaultPermissionsForRole } from "../../types/access.types";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  fullName?: string;
  email: string;
  password: string;
  tenantName?: string;
}

export interface PublicUser {
  id: string;
  username: string;
  fullName?: string | null;
  email: string;
  tenantId?: string | null;
  role: string;
  status: string;
  permissions: string[];
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PublicTenant {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  sessionId: string;
  connected: boolean;
  lastConnected?: Date | null;
  aiEnabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AuthContext {
  user: PublicUser;
  tenant: PublicTenant;
  sessionId: string;
}

export class AuthService {
  private static readonly JWT_SECRET = env.JWT_SECRET || (() => {
    throw new Error("JWT_SECRET environment variable is required in production");
  })();
  private static readonly JWT_EXPIRES_IN = "15m";
  private static readonly REFRESH_TOKEN_EXPIRES_IN = "7d";

  static async register(
    data: RegisterData,
  ): Promise<{ user: PublicUser; tenant: PublicTenant; tokens: AuthTokens }> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedUsername = data.username.trim();

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    });

    if (existingUser) {
      throw new Error("Usuario ou email ja existe");
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const user = new User({
      username: normalizedUsername,
      fullName: data.fullName?.trim() || normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      role: "owner",
      status: "active",
      permissions: getDefaultPermissionsForRole("owner"),
    });

    await user.save();

    const tenant = await TenantService.createTenantForOwner(user, {
      name: data.tenantName?.trim() || `${normalizedUsername} Workspace`,
    });

    const tokens = this.generateTokens(user._id.toString());
    const context = this.buildAuthContext(user, tenant);

    return {
      user: context.user,
      tenant: context.tenant,
      tokens,
    };
  }

  static async login(
    credentials: LoginCredentials,
  ): Promise<{ user: PublicUser; tenant: PublicTenant; tokens: AuthTokens }> {
    const normalizedEmail = credentials.email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !(await user.comparePassword(credentials.password))) {
      throw new Error("Credenciais invalidas");
    }

    if (user.status !== "active") {
      throw new Error("Conta inativa");
    }

    const tenant = await TenantService.ensureTenantForUser(user);

    if (tenant.status !== "active") {
      throw new Error("Tenant suspenso");
    }

    user.lastLoginAt = new Date();
    if (tenant.whatsappCredentials?.sessionId) {
      user.whatsappCredentials = {
        sessionId: tenant.whatsappCredentials.sessionId,
        connected: tenant.whatsappCredentials.connected,
        lastConnected: tenant.whatsappCredentials.lastConnected || undefined,
      };
    }
    await user.save();

    const tokens = this.generateTokens(user._id.toString());
    const context = this.buildAuthContext(user, tenant);

    return {
      user: context.user,
      tenant: context.tenant,
      tokens,
    };
  }

  static async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, this.JWT_SECRET) as { userId: string };

      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new Error("Usuario nao encontrado");
      }

      const tenant = await TenantService.ensureTenantForUser(user);
      if (user.status !== "active" || tenant.status !== "active") {
        throw new Error("Acesso indisponivel");
      }

      return this.generateTokens(user._id.toString());
    } catch (error) {
      throw new Error("Token de refresh invalido");
    }
  }

  static async getUserContextById(userId: string): Promise<AuthContext | null> {
    const user = await User.findById(userId);
    if (!user) {
      return null;
    }

    if (user.status !== "active") {
      return null;
    }

    const tenant = await TenantService.ensureTenantForUser(user);
    if (tenant.status !== "active") {
      return null;
    }

    return this.buildAuthContext(user, tenant);
  }

  static async getUserById(userId: string): Promise<PublicUser | null> {
    const context = await this.getUserContextById(userId);
    return context?.user || null;
  }

  static async updateWhatsAppCredentials(
    userId: string,
    sessionId: string,
    connected: boolean,
  ): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      return;
    }

    const tenant = await TenantService.ensureTenantForUser(user);

    tenant.whatsappCredentials = {
      sessionId,
      connected,
      lastConnected: connected ? new Date() : tenant.whatsappCredentials?.lastConnected || null,
    };
    await tenant.save();

    user.whatsappCredentials = {
      sessionId,
      connected,
      lastConnected: connected ? new Date() : user.whatsappCredentials?.lastConnected,
    };
    await user.save();
  }

  static async getUserWhatsAppCredentials(
    userId: string,
  ): Promise<{ sessionId: string; connected: boolean } | null> {
    const user = await User.findById(userId);
    if (!user) {
      return null;
    }

    const tenant = await TenantService.ensureTenantForUser(user);

    return {
      sessionId: tenant.whatsappCredentials.sessionId,
      connected: tenant.whatsappCredentials.connected,
    };
  }

  private static generateTokens(userId: string): AuthTokens {
    const accessToken = jwt.sign({ userId }, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN,
    });

    const refreshToken = jwt.sign({ userId }, this.JWT_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRES_IN,
    });

    return { accessToken, refreshToken };
  }

  private static buildAuthContext(user: IUser, tenant: ITenant): AuthContext {
    return {
      user: this.toPublicUser(user),
      tenant: this.toPublicTenant(tenant),
      sessionId: tenant.whatsappCredentials.sessionId,
    };
  }

  private static toPublicUser(user: IUser): PublicUser {
    return {
      id: user._id.toString(),
      username: user.username,
      fullName: user.fullName || null,
      email: user.email,
      tenantId: user.tenantId?.toString() || null,
      role: user.role,
      status: user.status,
      permissions: [...(user.permissions || [])],
      lastLoginAt: user.lastLoginAt || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private static toPublicTenant(tenant: ITenant): PublicTenant {
    return {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      description: tenant.description || null,
      status: tenant.status,
      sessionId: tenant.whatsappCredentials.sessionId,
      connected: tenant.whatsappCredentials.connected,
      lastConnected: tenant.whatsappCredentials.lastConnected || null,
      aiEnabled: !!tenant.aiEnabled,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  static verifyToken(token: string): { userId: string } {
    try {
      return jwt.verify(token, this.JWT_SECRET) as { userId: string };
    } catch (error) {
      throw new Error("Token invalido");
    }
  }
}
