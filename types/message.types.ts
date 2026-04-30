export type MessageKind =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "sticker"
  | "document"
  | "contact"
  | "location"
  | "poll"
  | "reaction"
  | "interactive"
  | "system"
  | "unknown";

export type MessageStatus =
  | "error"
  | "pending"
  | "server_ack"
  | "delivery_ack"
  | "read"
  | "played"
  | "unknown";

export type MessageDirection = "inbound" | "outbound";

export type MessageMedia = {
  kind: "image" | "video" | "audio" | "sticker" | "document";
  mimetype?: string;
  fileName?: string;
  caption?: string;
  seconds?: number;
  fileLength?: number;
  hasMedia?: boolean;
  mediaKeyTs?: number;
  mediaKey?: Buffer;
};

export type MessageReaction = {
  targetId?: string;
  emoji?: string;
};

export type MessageReactionFull = {
  emoji: string;
  actor?: string;
  fromMe?: boolean;
  timestamp?: number;
};

export type MessageInteractive = {
  kind: "buttons" | "list" | "template" | "native" | "response" | "unknown";
  title?: string;
  body?: string;
  footer?: string;
  selectedId?: string;
  selectedText?: string;
  options?: Array<{ id: string; title: string; description?: string }>;
};

export type MessageQuote = {
  id?: string;
  participant?: string;
  text?: string;
};

export type BaseMessage = {
  id?: string;
  jid: string;
  text?: string;
  fromMe: boolean;
  timestamp: number;
  name?: string;
  participant?: string;
  type?: MessageKind;
  status?: MessageStatus | number;
  rawType?: string;
  media?: MessageMedia;
  reaction?: MessageReaction;
  interactive?: MessageInteractive;
  quoted?: MessageQuote;
  isEdited?: boolean;
  isDeleted?: boolean;
  targetMessageId?: string;
  raw?: any;
};

export type SessionMessage = BaseMessage & {
  direction?: MessageDirection;
  reactions?: MessageReactionFull[];
};

export type ChatMessage = BaseMessage & {
  id: string;
  direction: MessageDirection;
  text: string;
  type: MessageKind;
  status?: MessageStatus;
  reactions?: MessageReactionFull[];
};

export type ContactUpdate = {
  id?: string;
  jid?: string;
  lid?: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
  profilePictureUrl?: string;
};

export type ChatMeta = {
  jid: string;
  name?: string;
  unread: number;
  lastTimestamp: number;
  lastMessage: string;
  lastMessageType?: MessageKind;
  profilePictureUrl?: string;
};

export type SessionEvent = {
  id: string;
  name: string;
  timestamp: number;
  summary: string;
};

export type SessionConnectionStatus =
  | "idle"
  | "connecting"
  | "qr"
  | "connected"
  | "closed";

export type SessionState = {
  status: SessionConnectionStatus;
  qr?: string;
  lastStatusCode?: number;
  updatedAt: number;
};

export type CreateSessionOptions = {
  onIncomingMessage?: (message: SessionMessage) => void;
  onHistoryMessage?: (message: SessionMessage) => void;
  onHistoryChat?: (chat: {
    jid: string;
    name?: string;
    unread?: number;
    lastTimestamp?: number;
    lastMessage?: string;
  }) => void;
  onContactUpdate?: (contact: ContactUpdate) => void;
  onConnectionUpdate?: (state: {
    connection?: string;
    qr?: string;
    statusCode?: number;
    isLoggedOut: boolean;
  }) => void;
  onMessageUpdate?: (update: {
    id: string;
    jid: string;
    text?: string;
    timestamp?: number;
    status?: number;
    type?: MessageKind;
    rawType?: string;
    media?: SessionMessage["media"];
    interactive?: SessionMessage["interactive"];
    quoted?: SessionMessage["quoted"];
    isEdited?: boolean;
    isDeleted?: boolean;
    participant?: string;
    name?: string;
  }) => void;
  onMessageDelete?: (payload: {
    jid: string;
    messageId: string;
    timestamp?: number;
  }) => void;
  onReaction?: (payload: {
    jid: string;
    messageId: string;
    emoji?: string;
    actor?: string;
    fromMe?: boolean;
    timestamp?: number;
  }) => void;
  onMessageReceipt?: (payload: {
    jid: string;
    messageId: string;
    participant?: string;
    status: "server_ack" | "delivery_ack" | "read" | "played";
    timestamp?: number;
  }) => void;
  onPresenceUpdate?: (payload: {
    jid: string;
    participant: string;
    lastKnownPresence?: string;
  }) => void;
  onEvent?: (payload: { name: string; summary: string }) => void;
};

export type SendMessagePayload = {
  jid: string;
  type?: "text" | "media" | "sticker" | "reaction" | "interactive";
  text?: string;
  mediaUrl?: string;
  mediaDataUrl?: string;
  mimetype?: string;
  fileName?: string;
  ptt?: boolean;
  seconds?: number;
  reaction?: {
    messageId: string;
    emoji?: string;
    participant?: string;
    fromMe?: boolean;
  };
  interactive?: {
    mode?: "buttons" | "list";
    title?: string;
    text?: string;
    footer?: string;
    buttonText?: string;
    buttons?: Array<{ id: string; text: string }>;
    sections?: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  };
};
