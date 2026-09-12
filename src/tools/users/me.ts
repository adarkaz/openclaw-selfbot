import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient, formatJson } from "../base.js";

const GetMeSchema = Type.Object({}, { additionalProperties: false });

export function createGetMeTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_get_me",
    label: "Get Telegram Me",
    description: "Get information about the authenticated Telegram user account",
    parameters: GetMeSchema,
    execute: async (
      _toolCallId: string,
      _params: Static<typeof GetMeSchema>,
    ) => {
      const client = resolveClient(clients);
      const me = await client.users.getMe();
      return formatJson(me);
    },
  };
}
