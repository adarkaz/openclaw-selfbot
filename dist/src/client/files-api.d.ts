import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import type { SendResult } from "../types.js";
export declare class FilesAPI {
    private client;
    private resolvePeer;
    private ensureConnected;
    constructor(client: () => TelegramClient, resolvePeer: (chatId: string) => Promise<Api.TypeInputPeer>, ensureConnected: () => void);
    sendFile(chatId: string, filePath: string, caption?: string, forceDocument?: boolean): Promise<SendResult>;
    /**
     * Chunked raw upload via Api.upload.SaveFilePart / SaveBigFilePart —
     * no gramjs uploadFile helper.
     */
    private _uploadFile;
}
//# sourceMappingURL=files-api.d.ts.map