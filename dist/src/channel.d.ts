import type { TelegramSelfBotClient } from "./client.js";
import { type TelegramSelfBotMonitor } from "./monitor.js";
declare const getRuntime: () => {
    clients: Map<string, TelegramSelfBotClient>;
    monitors: Map<string, TelegramSelfBotMonitor>;
}, setRuntime: (next: {
    clients: Map<string, TelegramSelfBotClient>;
    monitors: Map<string, TelegramSelfBotMonitor>;
}) => void;
export declare const telegramSelfBotPlugin: import("openclaw/plugin-sdk/channel-core").ChannelPlugin<any, unknown, unknown>;
export { getRuntime, setRuntime };
//# sourceMappingURL=channel.d.ts.map