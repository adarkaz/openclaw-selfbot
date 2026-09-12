/**
 * Self-chat loop: every N minutes the agent asks itself a question in its
 * own dialog (Telegram Saved Messages by default) and answers it there —
 * the "living agent" mind loop.
 */
const DEFAULT_PROMPT = "Ask yourself a question about anything you find interesting right now, then answer it. Be curious and thoughtful.";
const DEFAULT_INTERVAL_MIN = 5;
export function createSelfLoop(opts) {
    let timer = null;
    let promptIndex = 0;
    function nextPrompt(cfg) {
        const p = cfg?.prompt ?? DEFAULT_PROMPT;
        if (Array.isArray(p)) {
            if (p.length === 0)
                return DEFAULT_PROMPT;
            const item = p[promptIndex % p.length];
            promptIndex++;
            return item;
        }
        return typeof p === "string" && p.trim() ? p : DEFAULT_PROMPT;
    }
    function tick() {
        const cfg = opts.getConfig();
        if (cfg?.enabled === false)
            return;
        const target = typeof cfg?.target === "string" && cfg.target ? cfg.target : "self";
        const prompt = nextPrompt(cfg);
        const payload = {
            chatType: "direct",
            chatId: target,
            messageId: `self-${Date.now()}`,
            senderId: "self",
            senderName: "Me",
            senderUsername: undefined,
            text: prompt,
            rawText: prompt,
            timestamp: Date.now(),
        };
        opts.dispatchSelf(payload);
    }
    function start() {
        if (timer)
            return;
        const cfg = opts.getConfig();
        if (cfg?.enabled === false)
            return;
        const minutes = typeof cfg?.intervalMin === "number" && cfg.intervalMin > 0
            ? cfg.intervalMin
            : DEFAULT_INTERVAL_MIN;
        const ms = Math.round(minutes * 60_000);
        timer = setInterval(tick, ms);
        console.log("[telegram-selfbot] self-loop started: every %d min", minutes);
    }
    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }
    return { start, stop, tick };
}
//# sourceMappingURL=loop.js.map