import type { SendMessagePayload } from "../types/message.types";
import type { WASocket } from "@whiskeysockets/baileys";
import { ChatStore } from "../modules/chat/chat.store";
import { spawn } from "child_process";

export class MessageSender {
  constructor(
    private sock: WASocket,
    private sessionId: string,
  ) {}

  async sendMessage(payload: SendMessagePayload) {
    const type = payload.type || "text";

    const senders = {
      reaction: () => this.sendReaction(payload),
      interactive: () => this.sendInteractive(payload),
      media: () => this.sendMedia(payload),
      sticker: () => this.sendMedia(payload),
      text: () => this.sendText(payload),
    };

    const sender = senders[type as keyof typeof senders];
    if (!sender) {
      throw new Error(`Tipo de mensagem não suportado: ${type}`);
    }

    return await sender();
  }

  private async sendReaction(payload: SendMessagePayload) {
    const reaction = payload.reaction;
    if (!reaction?.messageId) {
      throw new Error("reaction.messageId é obrigatório");
    }

    const targetMessage = ChatStore.getMessage(
      this.sessionId,
      payload.jid,
      reaction.messageId,
    );

    const targetKey: any = {
      remoteJid: payload.jid,
      id: reaction.messageId,
      fromMe: reaction.fromMe ?? !!targetMessage?.fromMe,
    };

    if (reaction.participant || targetMessage?.participant) {
      targetKey.participant = reaction.participant || targetMessage?.participant;
    }

    const response = await this.sock.sendMessage(payload.jid, {
      react: {
        text: reaction.emoji || "",
        key: targetKey,
      },
    });

    ChatStore.addOutgoing(this.sessionId, {
      id: response?.key?.id || undefined,
      jid: payload.jid,
      text: reaction.emoji
        ? `[Reacao] ${reaction.emoji}`
        : "[Reacao removida]",
      type: "reaction",
      reaction: {
        targetId: reaction.messageId,
        emoji: reaction.emoji,
      },
      timestamp: Date.now(),
      status: "server_ack",
    });

    return response;
  }

  private async sendInteractive(payload: SendMessagePayload) {
    const interactive = payload.interactive || {};
    const mode = interactive.mode || "buttons";

    if (mode === "list") {
      return this.sendListMessage(payload);
    }

    return this.sendButtonsMessage(payload);
  }

  private async sendListMessage(payload: SendMessagePayload) {
    const interactive = payload.interactive || {};
    const sections = (interactive.sections || []).map((section) => ({
      title: section.title,
      rows: (section.rows || []).map((row) => ({
        rowId: row.id,
        title: row.title,
        description: row.description,
      })),
    }));

    const response = await this.sock.sendMessage(payload.jid, {
      title: interactive.title,
      text: interactive.text || payload.text || "Selecione uma opcao",
      footer: interactive.footer,
      buttonText: interactive.buttonText || "Abrir lista",
      sections,
    } as any);

    ChatStore.addOutgoing(this.sessionId, {
      id: response?.key?.id || undefined,
      jid: payload.jid,
      text: interactive.text || payload.text || "[Mensagem interativa]",
      type: "interactive",
      interactive: {
        kind: "list",
        title: interactive.title,
        body: interactive.text,
        footer: interactive.footer,
        options: (interactive.sections || []).flatMap((section) =>
          (section.rows || []).map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
          })),
        ),
      },
      timestamp: Date.now(),
      status: "server_ack",
    });

    return response;
  }

  private async sendButtonsMessage(payload: SendMessagePayload) {
    const interactive = payload.interactive || {};
    const buttons = (interactive.buttons || [])
      .slice(0, 3)
      .map((button, index) => ({
        buttonId: button.id || `btn_${index + 1}`,
        buttonText: { displayText: button.text || `Opcao ${index + 1}` },
        type: 1,
      }));

    const response = await this.sock.sendMessage(payload.jid, {
      text: interactive.text || payload.text || "Escolha uma opcao",
      footer: interactive.footer,
      buttons,
    } as any);

    ChatStore.addOutgoing(this.sessionId, {
      id: response?.key?.id || undefined,
      jid: payload.jid,
      text: interactive.text || payload.text || "[Mensagem interativa]",
      type: "interactive",
      interactive: {
        kind: "buttons",
        title: interactive.title,
        body: interactive.text,
        footer: interactive.footer,
        options: buttons.map((button: any) => ({
          id: button.buttonId,
          title: button.buttonText.displayText,
        })),
      },
      timestamp: Date.now(),
      status: "server_ack",
    });

    return response;
  }

  private async sendMedia(payload: SendMessagePayload) {
    const mediaKind = this.inferMediaType(payload);
    const { source, mimetype } = this.buildMediaSource(payload);
    const caption = payload.text || "";

    const normalized = await this.normalizeAudioVoiceNote({
      kind: mediaKind,
      source,
      mimetype,
      payload,
    });

    const content: any = this.buildMediaContent(
      mediaKind,
      normalized.source,
      normalized.mimetype,
      caption,
      payload,
    );

    const response = await this.sock.sendMessage(payload.jid, content);

    const mediaText = this.getMediaText(mediaKind, caption, payload.fileName);
    const storedMimetype = normalized.mimetype || mimetype;

    ChatStore.addOutgoing(this.sessionId, {
      id: response?.key?.id || undefined,
      jid: payload.jid,
      text: mediaText,
      type: mediaKind,
      media: {
        kind: mediaKind,
        mimetype: storedMimetype,
        fileName: payload.fileName,
        caption,
        hasMedia: true,
      },
      timestamp: Date.now(),
      status: "server_ack",
    });

    return response;
  }

  private async sendText(payload: SendMessagePayload) {
    const text = payload.text?.trim();

    if (!text) {
      throw new Error("text é obrigatório para mensagem de texto");
    }

    const response = await this.sock.sendMessage(payload.jid, { text });

    ChatStore.addOutgoing(this.sessionId, {
      id: response?.key?.id || undefined,
      jid: payload.jid,
      text,
      type: "text",
      timestamp: Date.now(),
      status: "server_ack",
    });

    return response;
  }

  private parseDataUrl(dataUrl?: string): {
    buffer?: Buffer;
    mimetype?: string;
  } {
    if (!dataUrl) {
      return {};
    }

    const match = dataUrl.match(/^data:([^,]+),(.*)$/);
    if (!match) return {};

    const header = match[1] || "";
    const base64Data = match[2] || "";

    const headerParts = header.split(";").map((part) => part.trim());
    const mimetype = headerParts[0] || undefined;
    const isBase64 = headerParts.includes("base64");

    if (!isBase64 || !base64Data) return {};

    return {
      mimetype,
      buffer: Buffer.from(base64Data, "base64"),
    };
  }

  private buildMediaSource(payload: SendMessagePayload): {
    source: Buffer | { url: string };
    mimetype?: string;
  } {
    const parsedDataUrl = this.parseDataUrl(payload.mediaDataUrl);

    if (parsedDataUrl.buffer) {
      return {
        source: parsedDataUrl.buffer,
        mimetype: payload.mimetype || parsedDataUrl.mimetype,
      };
    }

    const mediaUrl = payload.mediaUrl?.trim();

    if (!mediaUrl) {
      throw new Error(
        "Mídia não informada. Envie mediaDataUrl (base64) ou mediaUrl",
      );
    }

    return {
      source: { url: mediaUrl },
      mimetype: payload.mimetype,
    };
  }

  private inferMediaType(payload: SendMessagePayload): "image" | "video" | "audio" | "document" | "sticker" {
    if (payload.type === "sticker") {
      return "sticker";
    }

    const mime = (payload.mimetype || "").toLowerCase();

    if (mime.includes("image")) return "image";
    if (mime.includes("video")) return "video";
    if (mime.includes("audio")) return "audio";
    if (mime.includes("webp")) return "sticker";

    if (payload.fileName?.toLowerCase().endsWith(".webp")) {
      return "sticker";
    }

    return "document";
  }

  private async normalizeAudioVoiceNote(args: {
    kind: "image" | "video" | "audio" | "document" | "sticker";
    source: Buffer | { url: string };
    mimetype?: string;
    payload: SendMessagePayload;
  }): Promise<{ source: Buffer | { url: string }; mimetype?: string }> {
    const { kind, source, mimetype, payload } = args;

    if (kind !== "audio" || !payload.ptt) {
      return { source, mimetype };
    }

    if (!Buffer.isBuffer(source)) {
      return { source, mimetype };
    }

    if (mimetype?.toLowerCase().includes("audio/ogg")) {
      return { source, mimetype };
    }

    const converted = await convertAudioToOggOpus(source);
    return { source: converted, mimetype: "audio/ogg; codecs=opus" };
  }

  private buildMediaContent(
    kind: "image" | "video" | "audio" | "sticker" | "document",
    source: Buffer | { url: string },
    mimetype?: string,
    caption?: string,
    payload?: SendMessagePayload
  ) {
    const content: any = {};

    if (kind === "image") {
      content.image = source;
      if (caption) content.caption = caption;
    } else if (kind === "video") {
      content.video = source;
      if (caption) content.caption = caption;
    } else if (kind === "audio") {
      content.audio = source;
      content.ptt = !!payload?.ptt;
      if (payload?.seconds) {
        content.seconds = payload.seconds;
      }
    } else if (kind === "sticker") {
      content.sticker = source;
    } else {
      content.document = source;
      content.mimetype = mimetype || "application/octet-stream";
      content.fileName = payload?.fileName || "arquivo";
      if (caption) content.caption = caption;
    }

    if (mimetype && kind !== "document") {
      content.mimetype = mimetype;
    }

    return content;
  }

  private getMediaText(kind: "image" | "video" | "audio" | "sticker" | "document", caption?: string, fileName?: string): string {
    const mediaTexts = {
      image: () => caption || "[Imagem]",
      video: () => caption || "[Video]",
      audio: () => "[Audio]",
      sticker: () => "[Sticker]",
      document: () => caption || fileName || "[Documento]",
    };

    return mediaTexts[kind]();
  }
}

async function convertAudioToOggOpus(input: Buffer): Promise<Buffer> {
  const timeoutMs = 30_000;

  return await new Promise<Buffer>((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-vn",
        "-ac",
        "1",
        "-c:a",
        "libopus",
        "-b:a",
        "24k",
        "-vbr",
        "on",
        "-compression_level",
        "10",
        "-f",
        "ogg",
        "pipe:1",
      ],
      { windowsHide: true },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const timer = setTimeout(() => {
      ffmpeg.kill();
      reject(new Error("Timeout ao converter áudio (ffmpeg)"));
    }, timeoutMs);

    ffmpeg.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    ffmpeg.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

    ffmpeg.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Falha ao iniciar ffmpeg para converter áudio: ${error.message}`,
        ),
      );
    });

    ffmpeg.on("close", (code) => {
      clearTimeout(timer);

      if (code === 0) {
        const output = Buffer.concat(stdoutChunks);
        if (output.length === 0) {
          reject(new Error("ffmpeg retornou áudio vazio"));
          return;
        }

        resolve(output);
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(
        new Error(
          `Falha ao converter áudio para OGG/Opus (ffmpeg exit ${code}).${stderr ? ` ${stderr}` : ""}`,
        ),
      );
    });

    ffmpeg.stdin.end(input);
  });
}
