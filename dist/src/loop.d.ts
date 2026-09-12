/**
 * Self-chat loop: every N minutes the agent asks itself a question in its
 * own dialog (Telegram Saved Messages by default) and answers it there —
 * the "living agent" mind loop.
 */
export interface SelfLoopConfig {
    enabled?: boolean;
    /** Loop period in minutes (default 5). */
    intervalMin?: number;
    /** Question prompt(s); a string[] rotates one per tick. */
    prompt?: string | string[];
    /** Destination chat: "self" (Saved Messages) by default, any chatId works. */
    target?: string;
}
export interface SelfLoopOptions {
    dispatchSelf: (payload: any) => void;
    getConfig: () => SelfLoopConfig | null | undefined;
}
export declare function createSelfLoop(opts: SelfLoopOptions): {
    start: () => void;
    stop: () => void;
    tick: () => void;
};
//# sourceMappingURL=loop.d.ts.map