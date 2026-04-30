import mongoose, { Document, Schema } from "mongoose";
import type { MessageKind } from "../types/message.types";

export interface IChatThread extends Document {
  sessionId: string;
  jid: string;
  aliases: string[];
  name?: string | null;
  unread: number;
  lastTimestamp: number;
  lastMessage: string;
  lastMessageType?: MessageKind | null;
  isGroup: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const chatThreadSchema = new Schema<IChatThread>(
  {
    sessionId: { type: String, required: true, index: true },
    jid: { type: String, required: true },
    aliases: { type: [String], default: [] },
    name: { type: String, default: null },
    unread: { type: Number, default: 0 },
    lastTimestamp: { type: Number, default: 0 },
    lastMessage: { type: String, default: "" },
    lastMessageType: { type: String, default: null },
    isGroup: { type: Boolean, default: false },
  },
  { timestamps: true },
);

chatThreadSchema.index({ sessionId: 1, jid: 1 }, { unique: true });
chatThreadSchema.index({ sessionId: 1, aliases: 1 });
chatThreadSchema.index({ sessionId: 1, lastTimestamp: -1 });

export const ChatThread = mongoose.model<IChatThread>(
  "ChatThread",
  chatThreadSchema,
);
