import { createChannelReplyPipeline } from "openclaw/plugin-sdk/channel-reply-pipeline";
import type { TelegramSelfBotClient } from "./client.js";
import type { InboundTelegramMessage } from "./types.js";

export interface DispatchDeps {
  runtime: any;
  cfg: any;
  getClient: () => TelegramSelfBotClient;
  getBotUsername: () => Promise<string | null>;
}

export function createDispatcher(deps: DispatchDeps) {
  const { runtime, cfg: _cfg, getClient, getBotUsername } = deps;
  let paused = true;

  function dispatchInboundMessage(payload: any) {
    if (paused) return;
    if (payload.chatType === "group") {
      void dispatchGroupMessage(payload);
    } else {
      dispatchDirectMessage(payload);
    }
  }

  /**
   * Resolve the agent that owns this chat via OpenClaw's route bindings
   * (config `bindings: [{type:"route", agentId, match:{channel, accountId, peer}}]`,
   * written by the dashboard "add channel to agent" flow). Falls back to the
   * configured default agent when no binding matches.
   */
  function resolveRouteAgentId(chatType: string, chatId: string): string {
    return runtime.channel.routing.resolveAgentRoute({
      cfg: _cfg,
      channel: "telegram-selfbot",
      accountId: "default",
      peer: {
        kind: chatType === "group" ? "group" : "direct",
        id: chatId,
      },
    }).agentId;
  }

  function dispatchDirectMessage(payload: any) {
    const agentId = resolveRouteAgentId("direct", payload.chatId);
    const sessionKey = runtime.channel.routing.buildAgentSessionKey({
      agentId,
      channel: "telegram-selfbot",
      accountId: "default",
      peer: { kind: "direct", id: payload.chatId },
    });

    dispatchToAgent(payload, sessionKey, agentId);
  }

  /**
   * Self-loop entry: synthetic "self" message, not gated by pause.
   * Its own session key (peer id = chatId, "self" by default) keeps the
   * self-chat dialog separate from every real DM.
   */
  function dispatchSelfMessage(payload: any) {
    const chatId = payload.chatId ?? "self";
    const agentId = resolveRouteAgentId("direct", chatId);
    const sessionKey = runtime.channel.routing.buildAgentSessionKey({
      agentId,
      channel: "telegram-selfbot",
      accountId: "default",
      peer: { kind: "direct", id: chatId },
    });

    dispatchToAgent(payload, sessionKey, agentId);
  }

  async function dispatchGroupMessage(payload: InboundTelegramMessage) {
    const username = await getBotUsername();

    const rawText: string = payload.rawText ?? payload.text ?? "";
    const mentioned = username
      ? rawText.toLowerCase().includes(`@${username.toLowerCase()}`)
      : false;
    const isReplyToBot = Boolean(payload.replyToMsgId);

    if (!mentioned && !isReplyToBot) {
      console.log(
        "[telegram-selfbot] group message skipped (not mentioned): chat=%s sender=%s",
        payload.chatId,
        payload.senderId,
      );
      return;
    }

    const agentId = resolveRouteAgentId("group", payload.chatId);
    const sessionKey = runtime.channel.routing.buildAgentSessionKey({
      agentId,
      channel: "telegram-selfbot",
      accountId: "default",
      peer: { kind: "group", id: payload.chatId },
    });

    dispatchToAgent(payload, sessionKey, agentId);
  }

  function dispatchToAgent(
    payload: any,
    sessionKey: string,
    agentId: string,
  ) {
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

    const { onModelSelected, typingCallbacks, ...replyPipeline } =
      createChannelReplyPipeline({
        cfg: _cfg,
        agentId,
        channel: "telegram-selfbot",
        accountId: "default",
      });

    const humanDelay = runtime.channel.reply.resolveHumanDelayConfig(
      _cfg,
      agentId,
    );

    const { dispatcher, replyOptions } =
      runtime.channel.reply.createReplyDispatcherWithTyping({
        ...replyPipeline,
        humanDelay,
        deliver: async (reply: any) => {
          const client = getClient();
          const rawTo = reply.to ?? payload.chatId;
          const to = String(rawTo).replace(/^telegram-selfbot:/, "");
          const rawReplyTo = reply.replyToId ?? payload.messageId;
          const replyTo = Number.isFinite(Number(rawReplyTo))
            ? Number(rawReplyTo)
            : undefined;
          if (!to) return;
          const chunks = Array.isArray(reply.chunks)
            ? reply.chunks
            : [reply.text ?? reply.Body ?? ""];
          for (const chunk of chunks) {
            const text =
              typeof chunk === "string"
                ? chunk
                : chunk.text ?? chunk.Body ?? "";
            if (!text) continue;
            await client.messages.sendMessage(to, text, replyTo);
          }
        },
        onError: (err: any, info: any) => {
          console.error("[telegram-selfbot] deliver error:", err, info);
        },
      });

    runtime.channel.session
      .recordInboundSession({
        storePath,
        sessionKey,
        ctx,
        createIfMissing: true,
        onRecordError: (err: any) => {
          console.error("[telegram-selfbot] record error:", err);
        },
      })
      .catch((err: any) => {
        console.error("[telegram-selfbot] record error:", err);
      });

    runtime.channel.reply
      .dispatchReplyFromConfig({
        ctx,
        cfg: _cfg,
        dispatcher,
        replyOptions: { ...replyOptions, onModelSelected },
      })
      .catch((err: any) => {
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
