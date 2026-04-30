import mongoose, { Document, Schema } from "mongoose";
import type {
  MessageDirection,
  MessageInteractive,
  MessageKind,
  MessageMedia,
  MessageQuote,
  MessageReaction,
  MessageReactionFull,
  MessageStatus,
} from "../types/message.types";

export interface IChatMessage extends Document<string> {
  _id: string;
  sessionId: string;
  id: string;
  jid: string;
  remoteJid?: string | null;
  fromMe: boolean;
  direction: MessageDirection;
  timestamp: number;
  text: string;
  type: MessageKind;
  status?: MessageStatus | null;
  rawType?: string | null;
  name?: string | null;
  participant?: string | null;
  media?: MessageMedia | null;
  reaction?: MessageReaction | null;
  interactive?: MessageInteractive | null;
  quoted?: MessageQuote | null;
  isEdited?: boolean;
  isDeleted?: boolean;
  reactions?: MessageReactionFull[] | null;
  createdAt: Date;
  updatedAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, required: true, index: true },
    id: { type: String, required: true, index: true },
    jid: { type: String, required: true, index: true },
    remoteJid: { type: String, default: null, index: true },
    fromMe: { type: Boolean, required: true },
    direction: { type: String, required: true },
    timestamp: { type: Number, required: true, index: true },
    text: { type: String, default: "" },
    type: { type: String, required: true },
    status: { type: String, default: null },
    rawType: { type: String, default: null },
    name: { type: String, default: null },
    participant: { type: String, default: null },
    media: { type: Schema.Types.Mixed, default: null },
    reaction: { type: Schema.Types.Mixed, default: null },
    interactive: { type: Schema.Types.Mixed, default: null },
    quoted: { type: Schema.Types.Mixed, default: null },
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    reactions: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

chatMessageSchema.index({ sessionId: 1, jid: 1, timestamp: 1 });

export const ChatMessage = mongoose.model<IChatMessage>(
  "ChatMessage",
  chatMessageSchema,
);
