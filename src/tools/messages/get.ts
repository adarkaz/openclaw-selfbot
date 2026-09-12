import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient, formatJson } from "../base.js";

const GetMessagesSchema = Type.Object(
  {
    chatId: Type.String({ description: "Chat/group/channel ID" }),
    limit: Type.Optional(
      Type.Number({ default: 50, description: "Max messages to return" }),
    ),
    offsetId: Type.Optional(
      Type.Number({ description: "Offset message ID for pagination" }),
    ),
  },
  { additionalProperties: false },
);

export function createGetMessagesTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_get_messages",
    label: "Get Telegram Messages",
    description:
      "Get message history from a specific Telegram chat, group, or channel",
    parameters: GetMessagesSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof GetMessagesSchema>,
    ) => {
      const client = resolveClient(clients);
      const messages = await client.messages.getMessages(
        params.chatId,
        params.limit,
        params.offsetId,
      );
      return formatJson(messages);
    },
  };
}
