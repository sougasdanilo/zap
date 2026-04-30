import { Tenant, type ITenant } from "../../models/tenant.model";
import { User, type IUser } from "../../models/user.model";
import { createDefaultAIConfig } from "../../types/ai.types";
import { getDefaultPermissionsForRole } from "../../types/access.types";

function slugify(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function randomSuffix(length = 6): string {
  return Math.random().toString(36).slice(2, 2 + length);
}

export class TenantService {
  static getTenantSessionId(tenant: Pick<ITenant, "whatsappCredentials">): string {
    return tenant.whatsappCredentials?.sessionId || "";
  }

  static async generateUniqueSlug(baseName: string): Promise<string> {
    const base = slugify(baseName) || "workspace";

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = attempt === 0 ? "" : `-${randomSuffix(4)}`;
      const candidate = `${base}${suffix}`;
      const exists = await Tenant.exists({ slug: candidate });

      if (!exists) {
        return candidate;
      }
    }

    return `${base}-${Date.now().toString(36)}`;
  }

  static async generateUniqueSessionId(baseName: string): Promise<string> {
    const base = slugify(baseName) || "workspace";

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = attempt === 0 ? randomSuffix(4) : randomSuffix(6);
      const candidate = `tenant-${base}-${suffix}`;
      const exists = await Tenant.exists({
        "whatsappCredentials.sessionId": candidate,
      });

      if (!exists) {
        return candidate;
      }
    }

    return `tenant-${base}-${Date.now().toString(36)}`;
  }

  static async createTenantForOwner(
    user: IUser,
    options: {
      name?: string;
      description?: string;
      sessionId?: string;
    } = {},
  ): Promise<ITenant> {
    if (user.tenantId) {
      const existing = await Tenant.findById(user.tenantId);
      if (existing) {
        return existing;
      }
    }

    const tenantName =
      options.name?.trim() ||
      user.fullName?.trim() ||
      `${user.username} Workspace`;
    const slug = await this.generateUniqueSlug(tenantName);
    const sessionId =
      options.sessionId?.trim() || (await this.generateUniqueSessionId(slug));

    const tenant = await Tenant.create({
      name: tenantName,
      slug,
      description: options.description?.trim() || null,
      status: "active",
      ownerUserId: user._id,
      whatsappCredentials: {
        sessionId,
        connected: false,
        lastConnected: null,
      },
      aiConfig: createDefaultAIConfig(),
      aiEnabled: false,
    });

    user.tenantId = tenant._id;
    user.role = "owner";
    user.status = "active";
    user.permissions = getDefaultPermissionsForRole("owner");
    user.whatsappCredentials = {
      sessionId,
      connected: false,
      lastConnected: user.whatsappCredentials?.lastConnected,
    };
    await user.save();

    return tenant;
  }

  static async ensureTenantForUser(user: IUser): Promise<ITenant> {
    if (user.tenantId) {
      const tenant = await Tenant.findById(user.tenantId);
      if (tenant) {
        const shouldSync =
          user.role !== "owner" ||
          user.status !== "active" ||
          (user.permissions || []).length !== getDefaultPermissionsForRole("owner").length;

        if (shouldSync && tenant.ownerUserId?.toString() === user._id.toString()) {
          user.role = "owner";
          user.status = "active";
          user.permissions = getDefaultPermissionsForRole("owner");
          await user.save();
        }

        return tenant;
      }
    }

    return this.createTenantForOwner(user, {
      name: user.fullName?.trim() || `${user.username} Workspace`,
      sessionId: user.whatsappCredentials?.sessionId || undefined,
    });
  }

  static async getTenantById(tenantId: string): Promise<ITenant | null> {
    return Tenant.findById(tenantId);
  }

  static async getTenantBySessionId(sessionId: string): Promise<ITenant | null> {
    return Tenant.findOne({ "whatsappCredentials.sessionId": sessionId });
  }

  static async syncWhatsAppConnection(
    sessionId: string,
    connected: boolean,
  ): Promise<void> {
    const lastConnected = connected ? new Date() : null;

    await Tenant.updateOne(
      { "whatsappCredentials.sessionId": sessionId },
      {
        $set: {
          "whatsappCredentials.connected": connected,
          ...(lastConnected
            ? { "whatsappCredentials.lastConnected": lastConnected }
            : {}),
        },
      },
    ).exec();

    await User.updateMany(
      { "whatsappCredentials.sessionId": sessionId },
      {
        $set: {
          "whatsappCredentials.connected": connected,
          ...(lastConnected
            ? { "whatsappCredentials.lastConnected": lastConnected }
            : {}),
        },
      },
    ).exec();
  }

  static async updateTenantProfile(
    tenantId: string,
    payload: { name?: string; description?: string | null },
  ): Promise<ITenant | null> {
    const nextName = payload.name?.trim();
    const nextDescription = payload.description?.trim();

    return Tenant.findByIdAndUpdate(
      tenantId,
      {
        $set: {
          ...(nextName ? { name: nextName } : {}),
          description: nextDescription || null,
        },
      },
      { new: true },
    );
  }
}
