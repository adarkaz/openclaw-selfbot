import { createChatChannelPlugin, createChannelPluginBase, } from "openclaw/plugin-sdk/channel-core";
import { patchScopedAccountConfig } from "openclaw/plugin-sdk/setup";
import { createPluginRuntimeStore, } from "openclaw/plugin-sdk/runtime-store";
import { telegramSelfBotAdapter } from "./adapter.js";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// ---- Runtime store ----
const { getRuntime, setRuntime } = createPluginRuntimeStore("telegram-selfbot: runtime not initialized");
// ---- Account resolution ----
const CHANNEL_KEY = "telegram-selfbot";
function getChannelSection(cfg) {
    return cfg.channels?.[CHANNEL_KEY] ?? {};
}
function resolveAccount(cfg, accountId) {
    const section = getChannelSection(cfg);
    const apiId = section.apiId;
    const apiHash = section.apiHash;
    const phoneNumber = section.phoneNumber;
    if (!apiId || !apiHash) {
        throw new Error(`${CHANNEL_KEY}: apiId and apiHash are required (get them from my.telegram.org)`);
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
        },
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
            resolveAccountId: () => "default",
            resolveBindingAccountId: () => "default",
            applyAccountConfig: ({ cfg, input }) => {
                // Merge whatever the setup surface collected (wizard steps or CLI
                // flags) into the raw channels.telegram-selfbot section.
                const section = {
                    ...getChannelSection(cfg),
                    enabled: true,
                };
                for (const [k, v] of Object.entries(input ?? {})) {
                    if (v !== undefined && v !== null && v !== "")
                        section[k] = v;
                }
                return {
                    ...cfg,
                    channels: {
                        ...cfg.channels,
                        [CHANNEL_KEY]: section,
                    },
                };
            },
        },
        setupWizard: {
            channel: CHANNEL_KEY,
            getStatus: async ({ cfg }) => {
                const section = getChannelSection(cfg);
                const configured = Boolean(section.apiId && section.apiHash);
                return {
                    channel: CHANNEL_KEY,
                    configured,
                    statusLines: configured
                        ? [
                            `Telegram apiId + apiHash configured${section.phoneNumber ? " (phone number set)" : ""}`,
                        ]
                        : ["Needs Telegram apiId + apiHash from my.telegram.org"],
                };
            },
            configure: async ({ cfg, prompter }) => {
                await prompter.note("Connect a real Telegram user account (self-bot) via MTProto.\n" +
                    "Get apiId and apiHash at https://my.telegram.org/apps.", "Telegram Self-Bot");
                const apiId = await prompter.text({
                    message: "Telegram apiId (digits from my.telegram.org)",
                    placeholder: "123456",
                    validate: (v) => /^\d+$/.test(v.trim()) ? undefined : "apiId must be a number",
                });
                const apiHash = await prompter.text({
                    message: "Telegram apiHash",
                    placeholder: "abc123...",
                    sensitive: true,
                    validate: (v) => v.trim() ? undefined : "apiHash is required",
                });
                const phoneNumber = await prompter.text({
                    message: "Phone number in international format (the account you log in as)",
                    placeholder: "+79991234567",
                });
                const next = patchScopedAccountConfig({
                    cfg,
                    channelKey: CHANNEL_KEY,
                    accountId: "default",
                    patch: {
                        apiId: Number(apiId.trim()),
                        apiHash: apiHash.trim(),
                        phoneNumber: phoneNumber.trim(),
                        enabled: true,
                        autoResume: true,
                    },
                    ensureChannelEnabled: true,
                });
                return { cfg: next, accountId: "default" };
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
            notify: async ({ id, message, cfg }) => {
                const rt = getRuntime();
                if (!rt)
                    throw new Error("Runtime not initialized");
                const account = resolveAccount(cfg);
                const client = rt.clients.get(account.accountId);
                if (!client)
                    throw new Error("Client not connected");
                await client.messages.sendMessage(id, message);
            },
        },
    },
    threading: { topLevelReplyToMode: "reply" },
    outbound: {
        attachedResults: {
            channel: CHANNEL_KEY,
            sendText: async (params) => {
                const rt = getRuntime();
                if (!rt)
                    throw new Error("Runtime not initialized");
                const client = rt.clients.get(params.accountId ?? "default");
                if (!client)
                    throw new Error(`Client not found for ${params.accountId}`);
                const transformed = telegramSelfBotAdapter.transformOutbound({
                    chatId: params.to,
                    text: params.text,
                    replyTo: params.replyToId ?? undefined,
                });
                const result = await client.messages.sendMessage(transformed.chatId, transformed.text, transformed.replyTo);
                return { messageId: String(result.messageId) };
            },
            sendMedia: async (params) => {
                const rt = getRuntime();
                if (!rt)
                    throw new Error("Runtime not initialized");
                const client = rt.clients.get(params.accountId ?? "default");
                if (!client)
                    throw new Error(`Client not found for ${params.accountId}`);
                if (!params.mediaUrl) {
                    throw new Error("sendMedia: mediaUrl is required");
                }
                let filePath;
                if (/^https?:\/\//i.test(params.mediaUrl)) {
                    const res = await fetch(params.mediaUrl);
                    if (!res.ok) {
                        throw new Error(`sendMedia: download failed (HTTP ${res.status})`);
                    }
                    const buf = Buffer.from(await res.arrayBuffer());
                    filePath = join(tmpdir(), `tg-selfbot-${Date.now()}`);
                    await writeFile(filePath, buf);
                }
                else {
                    filePath = params.mediaUrl;
                }
                const result = await client.files.sendFile(params.to, filePath, params.text, Boolean(params.forceDocument));
                return { messageId: String(result.messageId) };
            },
        },
        base: {
            deliveryMode: "direct",
        },
    },
});
export { getRuntime, setRuntime };
//# sourceMappingURL=channel.js.map