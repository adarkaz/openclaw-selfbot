import type { OpenClawPluginApi } from "openclaw/plugin-sdk/channel-core";
import type { TelegramSelfBotClient } from "../client.js";
import { createSendMessageTool } from "./messages/send.js";
import { createGetMessagesTool } from "./messages/get.js";
import { createGetDialogsTool } from "./dialogs/list.js";
import { createSearchContactsTool } from "./contacts/search.js";
import { createSendFileTool } from "./files/send.js";
import { createGetMeTool } from "./users/me.js";
import { createUpdateProfileTool } from "./users/update-profile.js";
import { createUpdateUsernameTool } from "./users/update-username.js";
import { createSetAvatarTool } from "./users/set-avatar.js";
import { createSetPersonalChannelTool } from "./users/set-personal-channel.js";
import { createInvokeTool } from "./raw/invoke.js";

export function registerAllTools(
  api: OpenClawPluginApi,
  clients: Map<string, TelegramSelfBotClient>,
): void {
  const tools = [
    createSendMessageTool(clients),
    createGetMessagesTool(clients),
    createGetDialogsTool(clients),
    createSearchContactsTool(clients),
    createSendFileTool(clients),
    createGetMeTool(clients),
    createUpdateProfileTool(clients),
    createUpdateUsernameTool(clients),
    createSetAvatarTool(clients),
    createSetPersonalChannelTool(clients),
    createInvokeTool(clients),
  ];

  for (const tool of tools) {
    api.registerTool(tool, { name: tool.name });
  }
}
