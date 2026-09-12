import {
  createChatChannelPlugin,
  createChannelPluginBase,
} from "openclaw/plugin-sdk/channel-core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import {
  createPluginRuntimeStore,
} from "openclaw/plugin-sdk/runtime-store";
import type { TelegramSelfBotClient } from "./client.js";
import { telegramSelfBotAdapter } from "./adapter.js";
import {
  createTelegramSelfBotMonitor,
  type TelegramSelfBotMonitor,
} from "./monitor.js";


// ---- Runtime store ----
const { getRuntime, setRuntime } = createPluginRuntimeStore<{
  clients: Map<string, TelegramSelfBotClient>;
  monitors: Map<string, TelegramSelfBotMonitor>;
}>("telegram-selfbot: runtime not initialized");

// ---- Account resolution ----

const CHANNEL_KEY = "telegram-selfbot";

function getChannelSection(cfg: OpenClawConfig): Record<string, any> {
  return (cfg.channels as Record<string, any>)?.[CHANNEL_KEY] ?? {};
}

function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): {
  accountId: string;
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  sessionString?: string;
  password?: string;
  allowFrom: string[];
  dmPolicy: string | undefined;
} {
  const section = getChannelSection(cfg);
  const apiId = section.apiId;
  const apiHash = section.apiHash;
  const phoneNumber = section.phoneNumber;

  if (!apiId || !apiHash) {
    throw new Error(
      `${CHANNEL_KEY}: apiId and apiHash are required (get them from my.telegram.org)`,
    );
  }

  return {
    accountId: accountId ?? "default",
    apiId: Number(apiId),
    apiHash,
    phoneNumber: phoneNumber ?? "",
    sessionString: section.sessionString,
    password: section.password,
    allowFrom: section.allowFrom ?? [],
    dmPolicy: section.dmPolicy,
  };
}

// ---- Channel Plugin ----

export const telegramSelfBotPlugin = createChatChannelPlugin({
  base: createChannelPluginBase({
    id: CHANNEL_KEY,
    meta: {
      id: CHANNEL_KEY,
      label: "Telegram (Self-Bot)",
      selectionLabel: "Telegram (Self-Bot / MTProto)",
      detailLabel: "Telegram User Account",
      docsPath: "/channels/telegram-selfbot",
      docsLabel: "telegram-selfbot",
      blurb: "Connect as a real Telegram user account via MTProto. Supports DMs and groups.",
      systemImage: "paperplane",
      markdownCapable: true,
    },
    capabilities: {
      chatTypes: ["direct", "group", "channel"],
      media: true,
      reply: true,
      reactions: false,
      polls: false,
      edit: false,
      unsend: false,
      effects: false,
      groupManagement: false,
      threads: false,
      nativeCommands: false,
      blockStreaming: false,
    },
    configSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    } as any,
    config: {
      listAccountIds: (cfg) => ["default"],
      resolveAccount,
      inspectAccount(cfg, accountId) {
        const section = getChannelSection(cfg);
        const configured = Boolean(section.apiId && section.apiHash);
        return {
          enabled: configured,
          configured,
          tokenStatus: configured ? "available" : "missing",
        };
      },
    },
    setup: {
      resolveAccount,
      inspectAccount(cfg, accountId) {
        const section = getChannelSection(cfg);
        const configured = Boolean(section.apiId && section.apiHash);
        return {
          enabled: configured,
          configured,
          tokenStatus: configured ? "available" : "missing",
        };
      },
    },
  }),

  security: {
    dm: {
      channelKey: CHANNEL_KEY,
      resolvePolicy: (account) => account.dmPolicy,
      resolveAllowFrom: (account) => account.allowFrom,
      defaultPolicy: "allowlist",
    },
  },

  pairing: {
    text: {
      idLabel: "Telegram username or phone number",
      message: "Send this code to verify your identity:",
      notify: async ({ target, code, cfg }) => {
        const rt = getRuntime();
        if (!rt) throw new Error("Runtime not initialized");
        const account = resolveAccount(cfg);
        const client = rt.clients.get(account.accountId);
        if (!client) throw new Error("Client not connected");
        await client.messages.sendMessage(target, `Pairing code: ${code}`);
      },
    },
  },

  threading: { topLevelReplyToMode: "reply" },

  outbound: {
    attachedResults: {
      sendText: async (params) => {
        const rt = getRuntime();
        if (!rt) throw new Error("Runtime not initialized");
        const client = rt.clients.get(params.accountId ?? "default");
        if (!client) throw new Error(`Client not found for ${params.accountId}`);
        const transformed = telegramSelfBotAdapter.transformOutbound({
          chatId: params.to,
          text: params.text,
          replyTo: (params as any).replyTo,
        });
        const result = await client.messages.sendMessage(
          transformed.chatId,
          transformed.text,
          transformed.replyTo,
        );
        return { messageId: String(result.messageId) };
      },
    },
    base: {
      sendMedia: async (params) => {
        const rt = getRuntime();
        if (!rt) throw new Error("Runtime not initialized");
        const client = rt.clients.get(params.accountId ?? "default");
        if (!client) throw new Error(`Client not found for ${params.accountId}`);
        await client.files.sendFile(params.to, params.filePath, (params as any).caption);
      },
      sendTypingIndicator: async (params) => {
        const rt = getRuntime();
        if (!rt) throw new Error("Runtime not initialized");
        const client = rt.clients.get(params.accountId ?? "default");
        if (!client) return;
        await client.messages.sendTypingIndicator(params.to);
      },
      sendReadReceipt: async (params) => {
        const rt = getRuntime();
        if (!rt) throw new Error("Runtime not initialized");
        const client = rt.clients.get(params.accountId ?? "default");
        if (!client) return;
        await client.markAsRead(params.to, Number(params.messageId));
      },
    },
  },
});

export { getRuntime, setRuntime };
