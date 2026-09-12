import { telegramSelfBotAdapter } from "./adapter.js";
export function createTelegramSelfBotMonitor(client, dispatchInbound) {
    const unsubscribe = client.onMessage((tgMsg) => {
        const payload = telegramSelfBotAdapter.transformInbound(tgMsg);
        dispatchInbound(payload);
    });
    return {
        stop: () => {
            unsubscribe();
        },
    };
}
//# sourceMappingURL=monitor.js.map