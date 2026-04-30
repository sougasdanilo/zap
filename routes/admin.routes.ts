import { Router } from "express";
import { AdminService } from "../modules/admin/admin.service";
import { TenantService } from "../modules/tenant/tenant.service";
import {
  authenticateToken,
  requireAnyPermission,
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

router.get(
  "/overview",
  requireAnyPermission(["team:manage", "tenant:manage"]),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Usuario nao autenticado" });
      }

      const overview = await AdminService.getOverview({
        id: req.user.id,
        tenantId: req.user.tenantId,
        role: req.user.role,
        permissions: req.user.permissions,
      });

      res.json({
        ...overview,
        currentUser: req.user,
      });
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: "Erro ao carregar painel administrativo" });
    }
  },
);

router.get(
  "/users",
  requirePermission("team:manage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Usuario nao autenticado" });
      }

      const overview = await AdminService.getOverview({
        id: req.user.id,
        tenantId: req.user.tenantId,
        role: req.user.role,
        permissions: req.user.permissions,
      });

      res.json({ members: overview.members, metadata: overview.metadata });
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: "Erro ao listar colaboradores" });
    }
  },
);

router.post(
  "/users",
  requirePermission("team:manage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Usuario nao autenticado" });
      }

      const { username, fullName, email, password, role, status, permissions } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: "Username, email e senha sao obrigatorios" });
      }

      if (String(password).length < 6) {
        return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
      }

      const member = await AdminService.createCollaborator(
        {
          id: req.user.id,
          tenantId: req.user.tenantId,
          role: req.user.role,
          permissions: req.user.permissions,
        },
        {
          username,
          fullName,
          email,
          password,
          role,
          status,
          permissions,
        },
      );

      res.status(201).json({
        message: "Colaborador criado com sucesso",
        member,
      });
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: "Erro ao criar colaborador" });
    }
  },
);

router.patch(
  "/users/:userId",
  requirePermission("team:manage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Usuario nao autenticado" });
      }

      const rawUserId = req.params.userId;
      const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
      if (typeof userId !== "string") {
        return res.status(400).json({ error: "Colaborador invalido" });
      }

      const member = await AdminService.updateCollaborator(
        {
          id: req.user.id,
          tenantId: req.user.tenantId,
          role: req.user.role,
          permissions: req.user.permissions,
        },
        userId,
        req.body,
      );

      res.json({
        message: "Colaborador atualizado com sucesso",
        member,
      });
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: "Erro ao atualizar colaborador" });
    }
  },
);

router.patch(
  "/tenant",
  requirePermission("tenant:manage"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Usuario nao autenticado" });
      }

      const { name, description } = req.body;

      if (!name || String(name).trim().length < 2) {
        return res.status(400).json({ error: "Informe um nome valido para o tenant" });
      }

      const tenant = await TenantService.updateTenantProfile(req.user.tenantId, {
        name,
        description,
      });

      if (!tenant) {
        return res.status(404).json({ error: "Tenant nao encontrado" });
      }

      res.json({
        message: "Tenant atualizado com sucesso",
        tenant: AdminService.serializeTenant(tenant),
      });
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: "Erro ao atualizar tenant" });
    }
  },
);

export default router;
