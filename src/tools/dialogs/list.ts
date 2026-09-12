import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient, formatJson } from "../base.js";

const GetDialogsSchema = Type.Object(
  {
    limit: Type.Optional(
      Type.Number({ default: 20, description: "Max dialogs to return" }),
    ),
  },
  { additionalProperties: false },
);

export function createGetDialogsTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_get_dialogs",
    label: "Get Telegram Dialogs",
    description:
      "Get list of Telegram dialogs (chats, groups, channels) sorted by most recent activity",
    parameters: GetDialogsSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof GetDialogsSchema>,
    ) => {
      const client = resolveClient(clients);
      const dialogs = await client.dialogs.getDialogs(params.limit);
      return formatJson(dialogs);
    },
  };
}
