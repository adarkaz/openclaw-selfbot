import type { TelegramSelfBotClient } from "./client.js";
import { telegramSelfBotAdapter } from "./adapter.js";
import type { InboundTelegramMessage } from "./types.js";

export function createTelegramSelfBotMonitor(
  client: TelegramSelfBotClient,
  dispatchInbound: (payload: ReturnType<typeof telegramSelfBotAdapter.transformInbound>) => void,
) {
  const unsubscribe = client.onMessage((tgMsg: InboundTelegramMessage) => {
    const payload = telegramSelfBotAdapter.transformInbound(tgMsg);
    dispatchInbound(payload);
  });

  return {
    stop: () => {
      unsubscribe();
    },
  };
}

export type TelegramSelfBotMonitor = ReturnType<
  typeof createTelegramSelfBotMonitor
>;
