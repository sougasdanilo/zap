import bcrypt from "bcryptjs";
import { User, type IUser } from "../../models/user.model";
import { Tenant, type ITenant } from "../../models/tenant.model";
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  canManageRole,
  getDefaultPermissionsForRole,
  getManageableRoles,
  normalizeRole,
  normalizeStatus,
  sanitizePermissions,
  type UserPermission,
  type UserRole,
  type UserStatus,
} from "../../types/access.types";

export interface AdminActor {
  id: string;
  tenantId: string;
  role: UserRole;
  permissions: UserPermission[];
}

export interface CollaboratorInput {
  username: string;
  fullName?: string;
  email: string;
  password: string;
  role?: UserRole;
  status?: UserStatus;
  permissions?: UserPermission[];
}

export interface CollaboratorUpdateInput {
  username?: string;
  fullName?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  status?: UserStatus;
  permissions?: UserPermission[];
}

export class AdminService {
  static async getTenantOrFail(tenantId: string): Promise<ITenant> {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      throw new Error("Tenant nao encontrado");
    }

    return tenant;
  }

  static serializeUser(user: IUser) {
    return {
      id: user._id.toString(),
      username: user.username,
      fullName: user.fullName || null,
      email: user.email,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      status: user.status,
      permissions: [...(user.permissions || [])],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt || null,
    };
  }

  static serializeTenant(tenant: ITenant) {
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

  static getMetadata(actorRole: UserRole) {
    return {
      roles: getManageableRoles(actorRole).map((role) => ({
        value: role,
        label: ROLE_LABELS[role],
        defaultPermissions: getDefaultPermissionsForRole(role),
      })),
      permissions: Object.entries(PERMISSION_LABELS).map(([value, label]) => ({
        value,
        label,
        description: PERMISSION_DESCRIPTIONS[value as UserPermission],
      })),
    };
  }

  static async getOverview(actor: AdminActor) {
    const tenant = await this.getTenantOrFail(actor.tenantId);
    const users = await User.find({ tenantId: actor.tenantId })
      .sort({ createdAt: 1 })
      .exec();

    const totalMembers = users.length;
    const activeMembers = users.filter((user) => user.status === "active").length;
    const admins = users.filter((user) => user.role === "admin").length;
    const collaborators = users.filter((user) => user.role === "collaborator").length;

    return {
      tenant: this.serializeTenant(tenant),
      members: users.map((user) => this.serializeUser(user)),
      stats: {
        totalMembers,
        activeMembers,
        admins,
        collaborators,
      },
      metadata: this.getMetadata(actor.role),
    };
  }

  static async createCollaborator(
    actor: AdminActor,
    payload: CollaboratorInput,
  ) {
    const role = normalizeRole(payload.role, "collaborator");
    const status = normalizeStatus(payload.status, "active");

    if (!canManageRole(actor.role, role)) {
      throw new Error("Seu perfil nao pode criar esse tipo de conta");
    }

    const username = payload.username.trim();
    const email = payload.email.trim().toLowerCase();

    const duplicate = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (duplicate) {
      throw new Error("Usuario ou email ja existe");
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(payload.password, salt);
    const tenant = await this.getTenantOrFail(actor.tenantId);

    const user = await User.create({
      username,
      fullName: payload.fullName?.trim() || username,
      email,
      password: hashedPassword,
      tenantId: tenant._id,
      role,
      status,
      permissions: sanitizePermissions(payload.permissions, role),
      whatsappCredentials: {
        sessionId: tenant.whatsappCredentials.sessionId,
        connected: tenant.whatsappCredentials.connected,
        lastConnected: tenant.whatsappCredentials.lastConnected || undefined,
      },
    });

    return this.serializeUser(user);
  }

  static async updateCollaborator(
    actor: AdminActor,
    userId: string,
    payload: CollaboratorUpdateInput,
  ) {
    const target = await User.findOne({
      _id: userId,
      tenantId: actor.tenantId,
    });

    if (!target) {
      throw new Error("Colaborador nao encontrado");
    }

    const isSelf = target._id.toString() === actor.id;
    const currentRole = target.role;

    if (!isSelf && !canManageRole(actor.role, currentRole)) {
      throw new Error("Seu perfil nao pode editar esse colaborador");
    }

    if (payload.role) {
      const nextRole = normalizeRole(payload.role, currentRole);
      if (!canManageRole(actor.role, nextRole)) {
        throw new Error("Seu perfil nao pode atribuir esse papel");
      }

      if (isSelf && nextRole !== currentRole) {
        throw new Error("Voce nao pode alterar o proprio papel");
      }

      target.role = nextRole;
      target.permissions = sanitizePermissions(payload.permissions, nextRole);
    } else if (payload.permissions) {
      target.permissions = sanitizePermissions(payload.permissions, target.role);
    }

    if (typeof payload.status !== "undefined") {
      const nextStatus = normalizeStatus(payload.status, target.status);

      if (isSelf && nextStatus !== "active") {
        throw new Error("Voce nao pode desativar a propria conta");
      }

      target.status = nextStatus;
    }

    if (payload.username) {
      const nextUsername = payload.username.trim();
      const duplicate = await User.findOne({
        username: nextUsername,
        _id: { $ne: target._id },
      });

      if (duplicate) {
        throw new Error("Nome de usuario ja existe");
      }

      target.username = nextUsername;
    }

    if (payload.email) {
      const nextEmail = payload.email.trim().toLowerCase();
      const duplicate = await User.findOne({
        email: nextEmail,
        _id: { $ne: target._id },
      });

      if (duplicate) {
        throw new Error("Email ja existe");
      }

      target.email = nextEmail;
    }

    if (typeof payload.fullName !== "undefined") {
      target.fullName = payload.fullName?.trim() || target.username;
    }

    if (payload.password?.trim()) {
      const salt = await bcrypt.genSalt(12);
      target.password = await bcrypt.hash(payload.password.trim(), salt);
    }

    await target.save();

    return this.serializeUser(target);
  }
}
