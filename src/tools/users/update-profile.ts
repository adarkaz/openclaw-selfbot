import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient, formatJson } from "../base.js";

const UpdateProfileSchema = Type.Object(
  {
    firstName: Type.Optional(
      Type.String({ description: "New first name / display name" }),
    ),
    lastName: Type.Optional(
      Type.String({ description: "New last name" }),
    ),
    about: Type.Optional(
      Type.String({ description: "New bio / about text (max 70 chars)" }),
    ),
  },
  { additionalProperties: false },
);

export function createUpdateProfileTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_update_profile",
    label: "Update Telegram Profile",
    description:
      "Update your Telegram profile: first name, last name, and/or bio (about). At least one field must be provided.",
    parameters: UpdateProfileSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof UpdateProfileSchema>,
    ) => {
      const client = resolveClient(clients);
      const me = await client.users.updateProfile(
        params.firstName,
        params.lastName,
        params.about,
      );
      return formatJson(me);
    },
  };
}
