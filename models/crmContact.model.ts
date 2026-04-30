import mongoose, { Document, Schema } from "mongoose";

export type CrmContactKind = "individual" | "group";

export interface ICrmContact extends Document {
  sessionId: string;
  jid: string;
  aliases: string[];
  kind: CrmContactKind;
  phone?: string | null;
  name?: string | null;
  notify?: string | null;
  verifiedName?: string | null;
  pushName?: string | null;
  firstMessageAt?: number | null;
  lastMessageAt?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  inboundCount: number;
  outboundCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const crmContactSchema = new Schema<ICrmContact>(
  {
    sessionId: { type: String, required: true, index: true },
    jid: { type: String, required: true },
    aliases: { type: [String], default: [] },
    kind: { type: String, required: true, default: "individual" },
    phone: { type: String, default: null, index: true },
    name: { type: String, default: null },
    notify: { type: String, default: null },
    verifiedName: { type: String, default: null },
    pushName: { type: String, default: null },
    firstMessageAt: { type: Number, default: null },
    lastMessageAt: { type: Number, default: null },
    lastInboundAt: { type: Number, default: null },
    lastOutboundAt: { type: Number, default: null },
    inboundCount: { type: Number, default: 0 },
    outboundCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

crmContactSchema.index({ sessionId: 1, jid: 1 }, { unique: true });
crmContactSchema.index({ sessionId: 1, aliases: 1 });
crmContactSchema.index({ sessionId: 1, lastMessageAt: -1 });

export const CrmContact = mongoose.model<ICrmContact>(
  "CrmContact",
  crmContactSchema,
);
