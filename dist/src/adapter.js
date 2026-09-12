export const telegramSelfBotAdapter = {
    id: "telegram-selfbot",
    channelId: "telegram-selfbot",
    capabilities: {
        chatTypes: ["direct", "group"],
        media: [
            { type: "text" },
            { type: "photo", maxSize: 10 * 1024 * 1024 },
            { type: "video", maxSize: 50 * 1024 * 1024 },
            { type: "document", maxSize: 100 * 1024 * 1024 },
            { type: "sticker" },
            { type: "voice" },
        ],
        live: ["typing", "read-receipt"],
        formats: {
            markup: ["html", "markdown"],
        },
    },
    transformInbound: (tgMsg) => {
        return {
            channelId: "telegram-selfbot",
            messageId: String(tgMsg.id),
            chatId: tgMsg.chatId,
            chatType: tgMsg.isGroup ? "group" : "direct",
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
    transformOutbound: (params) => {
        return {
            chatId: params.chatId,
            text: params.text,
            replyTo: params.replyTo ? Number(params.replyTo) : undefined,
        };
    },
};
//# sourceMappingURL=adapter.js.map