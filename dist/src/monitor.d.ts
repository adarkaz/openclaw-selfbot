import type { TelegramSelfBotClient } from "./client.js";
import { telegramSelfBotAdapter } from "./adapter.js";
export declare function createTelegramSelfBotMonitor(client: TelegramSelfBotClient, dispatchInbound: (payload: ReturnType<typeof telegramSelfBotAdapter.transformInbound>) => void): {
    stop: () => void;
};
export type TelegramSelfBotMonitor = ReturnType<typeof createTelegramSelfBotMonitor>;
//# sourceMappingURL=monitor.d.ts.map