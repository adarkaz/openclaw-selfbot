import { Api } from "telegram";
import type { InboundTelegramMessage } from "./types.js";
import { MessagesAPI } from "./client/messages-api.js";
import { UsersAPI } from "./client/users-api.js";
import { FilesAPI } from "./client/files-api.js";
type ConnectionState = "new" | "connecting" | "connected" | "reconnecting" | "disconnected";
export type MessageHandler = (msg: InboundTelegramMessage) => void;
export declare class TelegramSelfBotClient {
    private config;
    readonly accountId: string;
    readonly messages: MessagesAPI;
    readonly users: UsersAPI;
    readonly files: FilesAPI;
    private _client;
    private session;
    private state;
    private connectPromise;
    private messageHandlers;
    private peerCache;
    private userInfoCache;
    private _pendingLookups;
    private readReceiptQueue;
    private readReceiptTimer;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private baseReconnectDelay;
    constructor(config: {
        apiId: number;
        apiHash: string;
        phoneNumber: string;
        sessionString?: string;
        password?: string;
    }, accountId: string);
    get connected(): boolean;
    get currentState(): ConnectionState;
    connect(interactiveAuth?: {
        onCodeRequest: () => Promise<string>;
        onPasswordRequest: () => Promise<string>;
    }): Promise<void>;
    disconnect(): Promise<void>;
    onMessage(handler: MessageHandler): () => void;
    getSessionString(): string;
    /** Raw MTProto API call — agent-facing. Resolves Api.* constructor from dotted name. */
    rawInvoke(method: string, params: Record<string, unknown>): Promise<unknown>;
    /**
     * Fill in peers the agent referenced loosely:
     *  - string on peer/fromPeer/toPeer keys → resolvePeer ("self", id, @username, +phone)
     *  - inputPeerUser/Chat/Channel objects missing accessHash → peerCache,
     *    anywhere in the tree (direct values, array elements, `id` arrays)
     */
    private _autofillPeers;
    ensureConnected(): void;
    /** Resolve a chatId string into an InputPeer for gramjs API calls. */
    resolvePeer(chatId: string): Promise<Api.TypeInputPeer>;
    /** Send text via raw API, bypassing gramjs's broken getMessageId. */
    sendRawMessage(chatId: string, text: string, replyTo?: number, isRetry?: boolean): Promise<{
        id: number;
        chatId?: number;
        date?: number;
    }>;
    sendTypingIndicator(chatId: string): Promise<void>;
    markAsRead(chatId: string, messageId: number): Promise<void>;
    flushReadReceipts(): Promise<void>;
    private _doConnect;
    private _startReadReceiptTimer;
    private _stopReadReceiptTimer;
    private _flushReadReceipts;
    /**
     * Preload all dialogs (raw Api.messages.GetDialogs) to populate
     * peerCache with valid InputPeers + userInfoCache with display names.
     */
    private _preloadDialogs;
    /** Background lookup to fill userInfoCache for senders not in preloaded dialogs. */
    private _lookupUserInfo;
    private _resolveByUsername;
    private _resolveByPhone;
    private _resolveById;
    private _handleEvent;
}
export {};
//# sourceMappingURL=client.d.ts.map