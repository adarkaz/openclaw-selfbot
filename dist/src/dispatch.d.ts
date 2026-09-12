import type { TelegramSelfBotClient } from "./client.js";
export interface DispatchDeps {
    runtime: any;
    cfg: any;
    getClient: () => TelegramSelfBotClient;
    getBotUsername: () => Promise<string | null>;
}
export declare function createDispatcher(deps: DispatchDeps): {
    dispatchInboundMessage: (payload: any) => void;
    dispatchSelfMessage: (payload: any) => void;
    readonly paused: boolean;
    pause(): void;
    resume(): void;
};
//# sourceMappingURL=dispatch.d.ts.map