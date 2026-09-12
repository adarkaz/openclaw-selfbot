import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient, formatSuccess } from "../base.js";

const SetAvatarSchema = Type.Object(
  {
    filePath: Type.String({
      description: "Local path to the image file to set as profile photo",
    }),
  },
  { additionalProperties: false },
);

export function createSetAvatarTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_set_avatar",
    label: "Set Telegram Avatar",
    description:
      "Set your Telegram profile photo from a local image file (JPEG, PNG, etc.)",
    parameters: SetAvatarSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof SetAvatarSchema>,
    ) => {
      const client = resolveClient(clients);
      await client.users.setAvatar(params.filePath);
      return formatSuccess("Profile photo updated.");
    },
  };
}
