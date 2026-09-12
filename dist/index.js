import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { updateConfig } from "openclaw/plugin-sdk/config-runtime";
import { telegramSelfBotPlugin, setRuntime } from "./src/channel.js";
import { registerAllTools } from "./src/tools/index.js";
import { TelegramSelfBotClient } from "./src/client.js";
import { createTelegramSelfBotMonitor } from "./src/monitor.js";
import { createDispatcher } from "./src/dispatch.js";
import { createSelfLoop } from "./src/loop.js";
import { createInterface } from "node:readline";
function promptStdin(question) {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
// ---- Global state ----
const clients = new Map();
const monitors = new Map();
let startPromise = null;
let runtime = null;
let _cfg = null;
function resolveClient() {
    const client = clients.get("default");
    if (!client)
        throw new Error("Telegram self-bot not initialized");
    return client;
}
// ---- Bot identity cache ----
let _botUsername = undefined;
let _dispatcher = null;
let _selfLoop = null;
function getSelfLoopConfig() {
    return (_cfg?.channels?.["telegram-selfbot"]
        ?.selfLoop ?? null);
}
async function getBotUsername() {
    if (_botUsername !== undefined)
        return _botUsername;
    try {
        const client = clients.get("default");
        if (client?.connected) {
            const me = await client.users.getMe();
            _botUsername = me.username ?? null;
        }
    }
    catch {
        _botUsername = null;
    }
    return _botUsername ?? null;
}
// ---- Client lifecycle ----
async function startClient(cfg) {
    const section = cfg?.channels?.["telegram-selfbot"];
    if (!section?.apiId || !section?.apiHash)
        return;
    if (startPromise)
        return startPromise;
    const existing = clients.get("default");
    if (existing?.connected)
        return;
    _cfg = cfg;
    startPromise = (async () => {
        try {
            if (existing) {
                try {
                    await existing.disconnect();
                }
                catch { }
                clients.delete("default");
            }
            const client = new TelegramSelfBotClient({
                apiId: Number(section.apiId),
                apiHash: String(section.apiHash),
                phoneNumber: String(section.phoneNumber ?? ""),
                sessionString: section.sessionString,
                password: section.password,
            }, "default");
            clients.set("default", client);
            const interactiveAuth = {
                onCodeRequest: async () => {
                    const envCode = process.env.TELEGRAM_SELFBOT_AUTH_CODE;
                    if (envCode)
                        return envCode;
                    if (process.stdin.isTTY) {
                        return promptStdin("[telegram-selfbot] Enter the Telegram auth code sent to your app: ");
                    }
                    throw new Error("Telegram auth code required. Set TELEGRAM_SELFBOT_AUTH_CODE env var or run from a terminal.");
                },
                onPasswordRequest: async () => {
                    const pwd = process.env.TELEGRAM_SELFBOT_PASSWORD ?? section.password;
                    if (pwd)
                        return pwd;
                    if (process.stdin.isTTY) {
                        return promptStdin("[telegram-selfbot] Enter your 2FA password: ");
                    }
                    throw new Error("Telegram 2FA password required.");
                },
            };
            await client.connect(interactiveAuth);
            const sessionStr = client.getSessionString();
            if (sessionStr && sessionStr !== section.sessionString) {
                try {
                    await updateConfig((cfg) => {
                        const ch = cfg.channels ?? {};
                        const ts = ch["telegram-selfbot"] ?? {};
                        return {
                            ...cfg,
                            channels: { ...ch, "telegram-selfbot": { ...ts, sessionString: sessionStr } },
                        };
                    });
                }
                catch (err) {
                    console.error("[telegram-selfbot] Failed to persist session:", err);
                }
            }
            // Wire up dispatcher after client + runtime are ready
            const dispatcher = createDispatcher({
                runtime,
                cfg: _cfg,
                getClient: resolveClient,
                getBotUsername,
            });
            _dispatcher = dispatcher;
            const existingMonitor = monitors.get("default");
            if (existingMonitor)
                existingMonitor.stop();
            const monitor = createTelegramSelfBotMonitor(client, dispatcher.dispatchInboundMessage);
            monitors.set("default", monitor);
            // Self-chat loop: agent asks itself a question every N minutes
            if (_selfLoop) {
                _selfLoop.stop();
                _selfLoop = null;
            }
            _selfLoop = createSelfLoop({
                dispatchSelf: (payload) => dispatcher.dispatchSelfMessage(payload),
                getConfig: getSelfLoopConfig,
            });
            _selfLoop.start();
            // Alive by default: answer DMs without manual resume
            if (section.autoResume !== false) {
                dispatcher.resume();
            }
            console.log("[telegram-selfbot] Connected and monitoring inbound messages");
        }
        catch (err) {
            console.error("[telegram-selfbot] Failed to connect:", err);
            clients.delete("default");
        }
        finally {
            startPromise = null;
        }
    })();
    return startPromise;
}
async function stopAll() {
    _selfLoop?.stop();
    _selfLoop = null;
    for (const monitor of monitors.values())
        monitor.stop();
    monitors.clear();
    for (const client of clients.values())
        await client.disconnect();
    clients.clear();
    startPromise = null;
    _cfg = null;
    _dispatcher = null;
}
// ---- Entry ----
export default defineChannelPluginEntry({
    id: "telegram-selfbot",
    name: "Telegram Self-Bot",
    description: "Connect OpenClaw as a real Telegram user account via MTProto",
    plugin: telegramSelfBotPlugin,
    setRuntime(rt) {
        runtime = rt;
        setRuntime({ clients, monitors });
    },
    registerCliMetadata(api) {
        api.registerCli(({ program }) => {
            program.command("telegram-selfbot").description("Telegram Self-Bot management");
        }, {
            descriptors: [
                { name: "telegram-selfbot", description: "Telegram Self-Bot management", hasSubcommands: false },
            ],
        });
    },
    registerFull(api) {
        runtime = api.runtime;
        _cfg = api.config;
        startClient(api.config).catch((err) => console.error("[telegram-selfbot] start failed:", err));
        api.registerHook("gateway.started", async () => {
            _cfg = api.config;
            await startClient(api.config);
        }, { name: "telegram-selfbot-start" });
        api.registerHook("gateway.stopping", async () => {
            await stopAll();
        }, { name: "telegram-selfbot-stop" });
        registerAllTools(api, clients, api.config?.channels?.["telegram-selfbot"]);
        api.registerGatewayMethod("telegram-selfbot.getSessionString", (opts) => {
            opts.respond(true, { sessionString: resolveClient().getSessionString() });
        });
        api.registerGatewayMethod("telegram-selfbot.reconnect", async (opts) => {
            const client = resolveClient();
            await client.disconnect();
            await client.connect();
            opts.respond(true, { ok: true });
        });
        api.registerGatewayMethod("telegram-selfbot.pauseInbound", (opts) => {
            _dispatcher?.pause();
            opts.respond(true, { paused: _dispatcher?.paused ?? true });
        });
        api.registerGatewayMethod("telegram-selfbot.resumeInbound", (opts) => {
            _dispatcher?.resume();
            opts.respond(true, { paused: _dispatcher?.paused ?? false });
        });
    },
});
//# sourceMappingURL=index.js.map