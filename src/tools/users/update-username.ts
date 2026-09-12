import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient, formatJson } from "../base.js";

const UpdateUsernameSchema = Type.Object(
  {
    username: Type.String({
      description: "New @username (5-32 chars, alphanumeric + underscore)",
    }),
  },
  { additionalProperties: false },
);

export function createUpdateUsernameTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_update_username",
    label: "Update Telegram Username",
    description:
      "Change your Telegram @username. Username must be 5-32 characters, alphanumeric or underscores.",
    parameters: UpdateUsernameSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof UpdateUsernameSchema>,
    ) => {
      const client = resolveClient(clients);
      const me = await client.users.updateUsername(params.username);
      return formatJson(me);
    },
  };
}
