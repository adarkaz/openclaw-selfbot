import type { OpenClawPluginApi } from "openclaw/plugin-sdk/channel-core";
import type { TelegramSelfBotClient } from "../client.js";
import { createInvokeTool } from "./raw/invoke.js";
import { createWebSearchTool } from "./web/search.js";

export function registerAllTools(
  api: OpenClawPluginApi,
  clients: Map<string, TelegramSelfBotClient>,
  channelCfg?: Record<string, any> | null,
): void {
  const tools: any[] = [createInvokeTool(clients)];

  if (channelCfg?.webSearch?.enabled !== false) {
    tools.push(createWebSearchTool());
  }

  for (const tool of tools) {
    api.registerTool(tool, { name: tool.name });
  }
}
