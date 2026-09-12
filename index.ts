import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { updateConfig } from "openclaw/plugin-sdk/config-runtime";
import { telegramSelfBotPlugin, setRuntime } from "./src/channel.js";
import { registerAllTools } from "./src/tools/index.js";
import { TelegramSelfBotClient } from "./src/client.js";
import { createTelegramSelfBotMonitor } from "./src/monitor.js";
import { createDispatcher } from "./src/dispatch.js";
import { createSelfLoop } from "./src/loop.js";
import { createInterface } from "node:readline";

function promptStdin(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---- Global state ----
const clients = new Map<string, TelegramSelfBotClient>();
const monitors = new Map<
  string,
  ReturnType<typeof createTelegramSelfBotMonitor>
>();
let startPromise: Promise<void> | null = null;
let runtime: any = null;
let _cfg: any = null;

function resolveClient(): TelegramSelfBotClient {
  const client = clients.get("default");
  if (!client) throw new Error("Telegram self-bot not initialized");
  return client;
}

// ---- Bot identity cache ----
let _botUsername: string | null | undefined = undefined;
let _dispatcher: ReturnType<typeof createDispatcher> | null = null;
let _selfLoop: ReturnType<typeof createSelfLoop> | null = null;

function getSelfLoopConfig(): any {
  return (
    (_cfg?.channels as Record<string, any> | undefined)?.["telegram-selfbot"]
      ?.selfLoop ?? null
  );
}

async function getBotUsername(): Promise<string | null> {
  if (_botUsername !== undefined) return _botUsername;
  try {
    const client = clients.get("default");
    if (client?.connected) {
      const me = await client.users.getMe();
      _botUsername = me.username ?? null;
    }
  } catch {
    _botUsername = null;
  }
  return _botUsername ?? null;
}

// ---- Client lifecycle ----

async function startClient(cfg: any): Promise<void> {
  const section =
    (cfg?.channels as Record<string, any>)?.["telegram-selfbot"];
  if (!section?.apiId || !section?.apiHash) return;

  if (startPromise) return startPromise;
  const existing = clients.get("default");
  if (existing?.connected) return;

  _cfg = cfg;

  startPromise = (async () => {
    try {
      if (existing) {
        try { await existing.disconnect(); } catch {}
        clients.delete("default");
      }

      const client = new TelegramSelfBotClient(
        {
          apiId: Number(section.apiId),
          apiHash: String(section.apiHash),
          phoneNumber: String(section.phoneNumber ?? ""),
          sessionString: section.sessionString,
          password: section.password,
          proxy: section.proxy,
        },
        "default",
      );

      clients.set("default", client);

      const interactiveAuth = {
        onCodeRequest: async () => {
          const envCode = process.env.TELEGRAM_SELFBOT_AUTH_CODE;
          if (envCode) return envCode;
          if (process.stdin.isTTY) {
            return promptStdin(
              "[telegram-selfbot] Enter the Telegram auth code sent to your app: ",
            );
          }
          throw new Error(
            "Telegram auth code required. Set TELEGRAM_SELFBOT_AUTH_CODE env var or run from a terminal.",
          );
        },
        onPasswordRequest: async () => {
          const pwd = process.env.TELEGRAM_SELFBOT_PASSWORD ?? section.password;
          if (pwd) return pwd;
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
          await updateConfig((cfg: any) => {
            const ch = cfg.channels ?? {};
            const ts = ch["telegram-selfbot"] ?? {};
            return {
              ...cfg,
              channels: { ...ch, "telegram-selfbot": { ...ts, sessionString: sessionStr } },
            };
          });
        } catch (err) {
          console.error("[telegram-selfbot] Failed to persist session:", err);
        }
      }

      // Wire up dispatcher after client + runtime are ready.
      // The owning agent is resolved per message via OpenClaw's route
      // bindings (resolveAgentRoute), not hardcoded here.
      const dispatcher = createDispatcher({
        runtime,
        cfg: _cfg,
        getClient: resolveClient,
        getBotUsername,
      });
      _dispatcher = dispatcher;

      const existingMonitor = monitors.get("default");
      if (existingMonitor) existingMonitor.stop();

      const monitor = createTelegramSelfBotMonitor(client, dispatcher.dispatchInboundMessage);
      monitors.set("default", monitor);

      // Self-chat loop: agent asks itself a question every N minutes
      if (_selfLoop) {
        _selfLoop.stop();
        _selfLoop = null;
      }
      _selfLoop = createSelfLoop({
        dispatchSelf: (payload: any) => dispatcher.dispatchSelfMessage(payload),
        getConfig: getSelfLoopConfig,
      });
      _selfLoop.start();

      // Alive by default: answer DMs without manual resume
      if (section.autoResume !== false) {
        dispatcher.resume();
      }

      console.log("[telegram-selfbot] Connected and monitoring inbound messages");
    } catch (err) {
      console.error("[telegram-selfbot] Failed to connect:", err);
      clients.delete("default");
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

async function stopAll(): Promise<void> {
  _selfLoop?.stop();
  _selfLoop = null;
  for (const monitor of monitors.values()) monitor.stop();
  monitors.clear();
  for (const client of clients.values()) await client.disconnect();
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
    api.registerCli(
      ({ program }) => {
        program.command("telegram-selfbot").description("Telegram Self-Bot management");
      },
      {
        descriptors: [
          { name: "telegram-selfbot", description: "Telegram Self-Bot management", hasSubcommands: false },
        ],
      },
    );
  },

  registerFull(api) {
    runtime = api.runtime;
    _cfg = api.config as any;

    startClient(api.config as any).catch((err: any) =>
      console.error("[telegram-selfbot] start failed:", err),
    );

    api.registerHook("gateway.started", async () => {
      _cfg = api.config as any;
      await startClient(api.config as any);
    }, { name: "telegram-selfbot-start" });

    api.registerHook("gateway.stopping", async () => {
      await stopAll();
    }, { name: "telegram-selfbot-stop" });

    registerAllTools(
      api,
      clients,
      (api.config as any)?.channels?.["telegram-selfbot"],
    );

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
