import { Router } from "express";
import { AuthService } from "../modules/auth/auth.service";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { username, fullName, email, password, tenantName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Todos os campos obrigatorios devem ser preenchidos" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
    }

    if (!email.includes("@") || !email.includes(".")) {
      return res.status(400).json({ error: "Email invalido" });
    }

    const result = await AuthService.register({
      username,
      fullName,
      email,
      password,
      tenantName,
    });

    res.status(201).json({
      message: "Tenant criado com sucesso",
      user: result.user,
      tenant: result.tenant,
      sessionId: result.tenant.sessionId,
      tokens: result.tokens,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ja existe")) {
        return res.status(409).json({ error: error.message });
      }

      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha sao obrigatorios" });
    }

    const result = await AuthService.login({ email, password });

    res.json({
      message: "Login realizado com sucesso",
      user: result.user,
      tenant: result.tenant,
      sessionId: result.tenant.sessionId,
      tokens: result.tokens,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Credenciais")) {
        return res.status(401).json({ error: error.message });
      }

      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Token de refresh e obrigatorio" });
    }

    const tokens = await AuthService.refreshToken(refreshToken);

    res.json({
      message: "Tokens atualizados com sucesso",
      tokens,
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(401).json({ error: error.message });
    }

    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/me", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Usuario nao autenticado" });
    }

    const context = await AuthService.getUserContextById(userId);

    if (!context) {
      return res.status(404).json({ error: "Usuario nao encontrado" });
    }

    res.json({
      user: context.user,
      tenant: context.tenant,
      sessionId: context.sessionId,
    });
  } catch (error) {
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

export default router;
