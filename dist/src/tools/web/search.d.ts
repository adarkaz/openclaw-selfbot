import { type Static } from "@sinclair/typebox";
declare const WebSearchSchema: import("@sinclair/typebox").TObject<{
    query: import("@sinclair/typebox").TString;
    maxResults: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
}>;
interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
}
export declare function createWebSearchTool(): {
    name: string;
    label: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        query: import("@sinclair/typebox").TString;
        maxResults: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
    }>;
    execute: (_toolCallId: string, params: Static<typeof WebSearchSchema>) => Promise<{
        content: {
            type: "text";
            text: string;
        }[];
        details: WebSearchResult[];
    }>;
};
export {};
//# sourceMappingURL=search.d.ts.map