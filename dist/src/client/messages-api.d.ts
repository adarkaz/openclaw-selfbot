import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import type { SendResult } from "../types.js";
export declare class MessagesAPI {
    private client;
    private resolvePeer;
    private ensureConnected;
    private sendRawMessage;
    constructor(client: () => TelegramClient, resolvePeer: (chatId: string) => Promise<Api.TypeInputPeer>, ensureConnected: () => void, sendRawMessage: (chatId: string, text: string, replyTo?: number, isRetry?: boolean) => Promise<{
        id: number;
        chatId?: number;
        date?: number;
    }>);
    sendMessage(chatId: string, text: string, replyTo?: number): Promise<SendResult>;
    sendTypingIndicator(chatId: string): Promise<void>;
}
//# sourceMappingURL=messages-api.d.ts.map