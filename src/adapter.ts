import type { InboundTelegramMessage, SendResult } from "./types.js";

export const telegramSelfBotAdapter = {
  id: "telegram-selfbot",
  channelId: "telegram-selfbot",

  capabilities: {
    chatTypes: ["direct" as const, "group" as const],
    media: [
      { type: "text" as const },
      { type: "photo" as const, maxSize: 10 * 1024 * 1024 },
      { type: "video" as const, maxSize: 50 * 1024 * 1024 },
      { type: "document" as const, maxSize: 100 * 1024 * 1024 },
      { type: "sticker" as const },
      { type: "voice" as const },
    ],
    live: ["typing" as const, "read-receipt" as const],
    formats: {
      markup: ["html" as const, "markdown" as const],
    },
  },

  transformInbound: (tgMsg: InboundTelegramMessage) => {
    return {
      channelId: "telegram-selfbot" as const,
      messageId: String(tgMsg.id),
      chatId: tgMsg.chatId,
      chatType: tgMsg.isGroup ? ("group" as const) : ("direct" as const),
      text: tgMsg.text,
      rawText: tgMsg.rawText,
      senderId: tgMsg.senderId,
      senderName: tgMsg.senderName,
      senderUsername: tgMsg.senderUsername,
      timestamp: tgMsg.date * 1000,
      isReply: tgMsg.isReply,
      replyToMessageId: tgMsg.replyToMsgId
        ? String(tgMsg.replyToMsgId)
        : undefined,
      media: tgMsg.media
        ? {
            type: tgMsg.media.type,
            fileId: tgMsg.media.fileId,
            mimeType: tgMsg.media.mimeType,
            size: tgMsg.media.size,
          }
        : undefined,
    };
  },

  transformOutbound: (params: {
    chatId: string;
    text: string;
    replyTo?: string;
  }) => {
    return {
      chatId: params.chatId,
      text: params.text,
      replyTo: params.replyTo ? Number(params.replyTo) : undefined,
    };
  },
};

export type TransformedInbound = ReturnType<
  (typeof telegramSelfBotAdapter)["transformInbound"]
>;
export type TransformedOutbound = ReturnType<
  (typeof telegramSelfBotAdapter)["transformOutbound"]
>;
