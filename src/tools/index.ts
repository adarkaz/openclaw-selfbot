import type { OpenClawPluginApi } from "openclaw/plugin-sdk/channel-core";
import type { TelegramSelfBotClient } from "../client.js";
import { createInvokeTool } from "./raw/invoke.js";

export function registerAllTools(
  api: OpenClawPluginApi,
  clients: Map<string, TelegramSelfBotClient>,
  _channelCfg?: Record<string, any> | null,
): void {
  // Web search is provided by OpenClaw core's built-in web_search tool —
  // the plugin only registers tg_invoke.
  api.registerTool(createInvokeTool(clients), { name: "tg_invoke" });
}
