import { createChannelReplyPipeline } from "openclaw/plugin-sdk/channel-reply-pipeline";
export function createDispatcher(deps) {
    const { runtime, cfg: _cfg, getClient, getBotUsername, agentId } = deps;
    let paused = true;
    function dispatchInboundMessage(payload) {
        if (paused)
            return;
        if (payload.chatType === "group") {
            dispatchGroupMessage(payload);
        }
        else {
            dispatchDirectMessage(payload);
        }
    }
    function dispatchDirectMessage(payload) {
        const sessionKey = runtime.channel.routing.buildAgentSessionKey({
            agentId,
            channel: "telegram-selfbot",
            accountId: "default",
            peer: { kind: "direct", id: payload.chatId },
        });
        dispatchToAgent(payload, sessionKey);
    }
    /**
     * Self-loop entry: synthetic "self" message, not gated by pause.
     * Its own session key (peer id = chatId, "self" by default) keeps the
     * self-chat dialog separate from every real DM.
     */
    function dispatchSelfMessage(payload) {
        const sessionKey = runtime.channel.routing.buildAgentSessionKey({
            agentId,
            channel: "telegram-selfbot",
            accountId: "default",
            peer: { kind: "direct", id: payload.chatId ?? "self" },
        });
        dispatchToAgent(payload, sessionKey);
    }
    async function dispatchGroupMessage(payload) {
        const username = await getBotUsername();
        const rawText = payload.rawText ?? payload.text ?? "";
        const mentioned = username
            ? rawText.toLowerCase().includes(`@${username.toLowerCase()}`)
            : false;
        const isReplyToBot = Boolean(payload.replyToMsgId);
        if (!mentioned && !isReplyToBot) {
            console.log("[telegram-selfbot] group message skipped (not mentioned): chat=%s sender=%s", payload.chatId, payload.senderId);
            return;
        }
        const sessionKey = runtime.channel.routing.buildAgentSessionKey({
            agentId,
            channel: "telegram-selfbot",
            accountId: "default",
            peer: { kind: "group", id: payload.chatId },
        });
        dispatchToAgent(payload, sessionKey);
    }
    function dispatchToAgent(payload, sessionKey) {
        const storePath = runtime.channel.session.resolveStorePath(undefined, {
            agentId,
        });
        const body = payload.rawText || payload.text || "";
        const ctx = runtime.channel.reply.finalizeInboundContext({
            Body: body,
            BodyForAgent: body,
            SessionKey: sessionKey,
            AccountId: "default",
            From: `telegram-selfbot:${payload.chatId}:${payload.senderId}`,
            To: `telegram-selfbot:${payload.chatId}`,
            ReplyToId: payload.replyToMessageId
                ? String(payload.replyToMessageId)
                : undefined,
            MessageSid: String(payload.messageId),
            SenderId: payload.senderId,
            SenderName: payload.senderName,
            SenderUsername: payload.senderUsername,
            Provider: "telegram",
            Surface: "telegram",
            ChatType: payload.chatType,
            Timestamp: payload.timestamp,
        });
        const { onModelSelected, typingCallbacks, ...replyPipeline } = createChannelReplyPipeline({
            cfg: _cfg,
            agentId,
            channel: "telegram-selfbot",
            accountId: "default",
        });
        const humanDelay = runtime.channel.reply.resolveHumanDelayConfig(_cfg, agentId);
        const { dispatcher, replyOptions } = runtime.channel.reply.createReplyDispatcherWithTyping({
            ...replyPipeline,
            humanDelay,
            deliver: async (reply) => {
                const client = getClient();
                const rawTo = reply.to ?? payload.chatId;
                const to = String(rawTo).replace(/^telegram-selfbot:/, "");
                const rawReplyTo = reply.replyToId ?? payload.messageId;
                const replyTo = Number.isFinite(Number(rawReplyTo))
                    ? Number(rawReplyTo)
                    : undefined;
                if (!to)
                    return;
                const chunks = Array.isArray(reply.chunks)
                    ? reply.chunks
                    : [reply.text ?? reply.Body ?? ""];
                for (const chunk of chunks) {
                    const text = typeof chunk === "string"
                        ? chunk
                        : chunk.text ?? chunk.Body ?? "";
                    if (!text)
                        continue;
                    await client.messages.sendMessage(to, text, replyTo);
                }
            },
            onError: (err, info) => {
                console.error("[telegram-selfbot] deliver error:", err, info);
            },
        });
        runtime.channel.session
            .recordInboundSession({
            storePath,
            sessionKey,
            ctx,
            createIfMissing: true,
            onRecordError: (err) => {
                console.error("[telegram-selfbot] record error:", err);
            },
        })
            .catch((err) => {
            console.error("[telegram-selfbot] record error:", err);
        });
        runtime.channel.reply
            .dispatchReplyFromConfig({
            ctx,
            cfg: _cfg,
            dispatcher,
            replyOptions: { ...replyOptions, onModelSelected },
        })
            .catch((err) => {
            console.error("[telegram-selfbot] dispatch error:", err);
        });
    }
    return {
        dispatchInboundMessage,
        dispatchSelfMessage,
        get paused() { return paused; },
        pause() { paused = true; },
        resume() { paused = false; },
    };
}
//# sourceMappingURL=dispatch.js.map