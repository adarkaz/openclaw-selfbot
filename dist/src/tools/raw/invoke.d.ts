import { type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
declare const InvokeSchema: import("@sinclair/typebox").TObject<{
    method: import("@sinclair/typebox").TString;
    params: any;
}>;
export declare function createInvokeTool(clients: Map<string, TelegramSelfBotClient>): {
    name: string;
    label: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        method: import("@sinclair/typebox").TString;
        params: any;
    }>;
    execute: (_toolCallId: string, params: Static<typeof InvokeSchema>) => Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        details: unknown;
    }>;
};
export {};
//# sourceMappingURL=invoke.d.ts.map