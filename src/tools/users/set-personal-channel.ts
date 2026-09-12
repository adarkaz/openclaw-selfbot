import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient, formatSuccess } from "../base.js";

const SetPersonalChannelSchema = Type.Object(
  {
    channelId: Type.String({
      description:
        "Channel or supergroup ID to show on your profile (e.g. -1001234567890)",
    }),
  },
  { additionalProperties: false },
);

export function createSetPersonalChannelTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_set_personal_channel",
    label: "Set Personal Channel",
    description:
      "Set the public channel or supergroup that appears on your Telegram profile. Use a channel ID starting with -100.",
    parameters: SetPersonalChannelSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof SetPersonalChannelSchema>,
    ) => {
      const client = resolveClient(clients);
      await client.users.setPersonalChannel(params.channelId);
      return formatSuccess(
        `Personal channel set to ${params.channelId}`,
      );
    },
  };
}
