import type { InboundTelegramMessage } from "./types.js";
export declare const telegramSelfBotAdapter: {
    id: string;
    channelId: string;
    capabilities: {
        chatTypes: ("direct" | "group")[];
        media: ({
            type: "text";
            maxSize?: undefined;
        } | {
            type: "photo";
            maxSize: number;
        } | {
            type: "video";
            maxSize: number;
        } | {
            type: "document";
            maxSize: number;
        } | {
            type: "sticker";
            maxSize?: undefined;
        } | {
            type: "voice";
            maxSize?: undefined;
        })[];
        live: ("typing" | "read-receipt")[];
        formats: {
            markup: ("html" | "markdown")[];
        };
    };
    transformInbound: (tgMsg: InboundTelegramMessage) => {
        channelId: "telegram-selfbot";
        messageId: string;
        chatId: string;
        chatType: "direct" | "group";
        text: string;
        rawText: string;
        senderId: string;
        senderName: string;
        senderUsername: string | undefined;
        timestamp: number;
        isReply: boolean;
        replyToMessageId: string | undefined;
        media: {
            type: "photo" | "video" | "document" | "sticker" | "voice";
            fileId: string | undefined;
            mimeType: string | undefined;
            size: number | undefined;
        } | undefined;
    };
    transformOutbound: (params: {
        chatId: string;
        text: string;
        replyTo?: string;
    }) => {
        chatId: string;
        text: string;
        replyTo: number | undefined;
    };
};
export type TransformedInbound = ReturnType<(typeof telegramSelfBotAdapter)["transformInbound"]>;
export type TransformedOutbound = ReturnType<(typeof telegramSelfBotAdapter)["transformOutbound"]>;
//# sourceMappingURL=adapter.d.ts.map