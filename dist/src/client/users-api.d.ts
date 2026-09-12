import type { TelegramClient } from "telegram";
import type { TelegramMe } from "../types.js";
export declare class UsersAPI {
    private client;
    private ensureConnected;
    constructor(client: () => TelegramClient, ensureConnected: () => void);
    getMe(): Promise<TelegramMe>;
}
//# sourceMappingURL=users-api.d.ts.map