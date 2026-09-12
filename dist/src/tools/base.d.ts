import type { TelegramSelfBotClient } from "../client.js";
export declare function resolveClient(clients: Map<string, TelegramSelfBotClient>, accountId?: string | null): TelegramSelfBotClient;
export interface ToolResult {
    content: Array<{
        type: "text";
        text: string;
    }>;
    details?: unknown;
}
export declare function formatSuccess(text: string, details?: unknown): ToolResult;
export declare function formatJson(data: unknown): ToolResult;
//# sourceMappingURL=base.d.ts.map