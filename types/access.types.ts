export const USER_ROLES = ["owner", "admin", "collaborator"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "inactive"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_PERMISSIONS = [
  "dashboard:view",
  "chat:view",
  "chat:reply",
  "contacts:view",
  "ai:manage",
  "team:manage",
  "tenant:manage",
] as const;

export type UserPermission = (typeof USER_PERMISSIONS)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Proprietario",
  admin: "Administrador",
  collaborator: "Colaborador",
};

export const PERMISSION_LABELS: Record<UserPermission, string> = {
  "dashboard:view": "Acessar painel operacional",
  "chat:view": "Visualizar conversas",
  "chat:reply": "Responder mensagens",
  "contacts:view": "Consultar contatos",
  "ai:manage": "Gerenciar IA",
  "team:manage": "Gerenciar colaboradores",
  "tenant:manage": "Gerenciar tenant",
};

export const PERMISSION_DESCRIPTIONS: Record<UserPermission, string> = {
  "dashboard:view": "Permite abrir a console principal e acompanhar o atendimento.",
  "chat:view": "Permite listar conversas, contatos e mensagens do tenant.",
  "chat:reply": "Permite enviar mensagens na sessao compartilhada do tenant.",
  "contacts:view": "Permite consultar os dados consolidados de contatos.",
  "ai:manage": "Permite configurar a IA e alterar seu estado.",
  "team:manage": "Permite criar e editar contas de colaboradores.",
  "tenant:manage": "Permite alterar configuracoes do tenant e a infraestrutura compartilhada.",
};

const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, UserPermission[]> = {
  owner: [...USER_PERMISSIONS],
  admin: [
    "dashboard:view",
    "chat:view",
    "chat:reply",
    "contacts:view",
    "ai:manage",
    "team:manage",
  ],
  collaborator: [
    "dashboard:view",
    "chat:view",
    "chat:reply",
    "contacts:view",
  ],
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === "string" && USER_STATUSES.includes(value as UserStatus);
}

export function isUserPermission(value: unknown): value is UserPermission {
  return typeof value === "string" && USER_PERMISSIONS.includes(value as UserPermission);
}

export function normalizeRole(value: unknown, fallback: UserRole = "collaborator"): UserRole {
  return isUserRole(value) ? value : fallback;
}

export function normalizeStatus(value: unknown, fallback: UserStatus = "active"): UserStatus {
  return isUserStatus(value) ? value : fallback;
}

export function getDefaultPermissionsForRole(role: UserRole): UserPermission[] {
  return [...ROLE_DEFAULT_PERMISSIONS[role]];
}

export function sanitizePermissions(
  input: unknown,
  role: UserRole,
): UserPermission[] {
  if (role === "owner") {
    return getDefaultPermissionsForRole("owner");
  }

  const provided = Array.isArray(input)
    ? input.filter(isUserPermission)
    : getDefaultPermissionsForRole(role);

  const unique = Array.from(new Set(provided));
  const next = unique.length ? unique : getDefaultPermissionsForRole(role);

  return next.filter((permission) =>
    getDefaultPermissionsForRole("owner").includes(permission),
  );
}

export function hasPermission(
  permissions: Array<UserPermission | string> | undefined,
  permission: UserPermission,
): boolean {
  return Array.isArray(permissions) && permissions.includes(permission);
}

export function getManageableRoles(actorRole: UserRole): UserRole[] {
  if (actorRole === "owner") {
    return ["admin", "collaborator"];
  }

  if (actorRole === "admin") {
    return ["collaborator"];
  }

  return [];
}

export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return getManageableRoles(actorRole).includes(targetRole);
}
