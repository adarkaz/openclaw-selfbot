import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient, formatJson } from "../base.js";

const SearchContactsSchema = Type.Object(
  {
    query: Type.String({ description: "Search query for contacts" }),
    limit: Type.Optional(
      Type.Number({ default: 10, description: "Max results" }),
    ),
  },
  { additionalProperties: false },
);

export function createSearchContactsTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_search_contacts",
    label: "Search Telegram Contacts",
    description: "Search Telegram contacts by name or username",
    parameters: SearchContactsSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof SearchContactsSchema>,
    ) => {
      const client = resolveClient(clients);
      const contacts = await client.users.searchContacts(
        params.query,
        params.limit,
      );
      return formatJson(contacts);
    },
  };
}
