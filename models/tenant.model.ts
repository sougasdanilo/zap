import mongoose, { Document, Schema, Types } from "mongoose";
import type { AIConfig } from "../types/ai.types";
import { createDefaultAIConfig } from "../types/ai.types";

export type TenantStatus = "active" | "suspended";

export interface ITenant extends Document {
  name: string;
  slug: string;
  description?: string | null;
  status: TenantStatus;
  ownerUserId?: Types.ObjectId | null;
  whatsappCredentials: {
    sessionId: string;
    connected: boolean;
    lastConnected?: Date | null;
  };
  aiConfig: AIConfig;
  aiEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    description: {
      type: String,
      default: null,
      maxlength: 320,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    whatsappCredentials: {
      sessionId: {
        type: String,
        required: false,
        trim: true,
        default: null,
      },
      connected: {
        type: Boolean,
        default: false,
      },
      lastConnected: {
        type: Date,
        default: null,
      },
    },
    aiConfig: {
      type: Schema.Types.Mixed,
      default: () => createDefaultAIConfig(),
    },
    aiEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

tenantSchema.index({ slug: 1 }, { unique: true });
tenantSchema.index({ "whatsappCredentials.sessionId": 1 }, { unique: true, sparse: true });

export const Tenant = mongoose.model<ITenant>("Tenant", tenantSchema);
