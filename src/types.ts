import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";

export interface TelegramSelfBotAccount {
  accountId: string;
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  sessionString?: string;
  password?: string;
  allowFrom: string[];
  dmPolicy: string | undefined;
}

export interface TelegramSelfBotConfig {
  apiId?: number;
  apiHash?: string;
  phoneNumber?: string;
  sessionString?: string;
  password?: string;
  allowFrom?: string[];
  dmPolicy?: string;
}

export interface InboundTelegramMessage {
  id: number;
  chatId: string;
  text: string;
  rawText: string;
  senderId: string;
  senderName: string;
  senderUsername?: string;
  isGroup: boolean;
  isReply: boolean;
  replyToMsgId?: number;
  date: number;
  media?: {
    type: "photo" | "video" | "document" | "sticker" | "voice";
    fileId?: string;
    mimeType?: string;
    size?: number;
  };
}

export interface SendResult {
  messageId: number;
  chatId: string;
  date: number;
}

export interface TelegramMe {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phoneNumber?: string;
}
