import { Request, Response, NextFunction } from "express";
import { AuthService } from "../modules/auth/auth.service";
import type { UserPermission, UserRole } from "../types/access.types";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenantId: string;
    username: string;
    email: string;
    fullName?: string | null;
    role: UserRole;
    permissions: UserPermission[];
    sessionId: string;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Token de acesso nao fornecido" });
    }

    const decoded = AuthService.verifyToken(token);
    const context = await AuthService.getUserContextById(decoded.userId);

    if (!context || !context.user.tenantId) {
      return res.status(401).json({ error: "Usuario nao autenticado" });
    }

    req.user = {
      id: context.user.id,
      tenantId: context.user.tenantId,
      username: context.user.username,
      email: context.user.email,
      fullName: context.user.fullName || null,
      role: context.user.role as UserRole,
      permissions: (context.user.permissions || []) as UserPermission[],
      sessionId: context.sessionId,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Token invalido ou expirado" });
  }
};

export function requirePermission(permission: UserPermission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Usuario nao autenticado" });
    }

    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: "Voce nao possui permissao para esta acao" });
    }

    next();
  };
}

export function requireAnyPermission(permissions: UserPermission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Usuario nao autenticado" });
    }

    if (!permissions.some((permission) => req.user?.permissions.includes(permission))) {
      return res.status(403).json({ error: "Voce nao possui permissao para esta acao" });
    }

    next();
  };
}

export function ensureSessionAccess(paramNames: string[] = ["id", "sessionId"]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Usuario nao autenticado" });
    }

    const requestedSessionId = paramNames
      .map((paramName) => req.params[paramName])
      .find((value): value is string => typeof value === "string" && value.length > 0);

    if (!requestedSessionId) {
      return next();
    }

    if (requestedSessionId !== req.user.sessionId) {
      return res.status(403).json({ error: "Acesso negado a esta sessao" });
    }

    next();
  };
}

export const optionalAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      next();
      return;
    }

    const decoded = AuthService.verifyToken(token);
    const context = await AuthService.getUserContextById(decoded.userId);

    if (context?.user.tenantId) {
      req.user = {
        id: context.user.id,
        tenantId: context.user.tenantId,
        username: context.user.username,
        email: context.user.email,
        fullName: context.user.fullName || null,
        role: context.user.role as UserRole,
        permissions: (context.user.permissions || []) as UserPermission[],
        sessionId: context.sessionId,
      };
    }

    next();
  } catch (error) {
    next();
  }
};
