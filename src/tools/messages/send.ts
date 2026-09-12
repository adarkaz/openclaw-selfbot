import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient, formatSuccess } from "../base.js";

const SendMessageSchema = Type.Object(
  {
    chatId: Type.String({ description: "Target chat/group/channel ID" }),
    text: Type.String({ description: "Message text (Markdown/HTML supported)" }),
    replyTo: Type.Optional(
      Type.Number({ description: "Message ID to reply to" }),
    ),
  },
  { additionalProperties: false },
);

export function createSendMessageTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_send_message",
    label: "Send Telegram Message",
    description:
      "Send a message to a Telegram chat, group, or channel via your user account",
    parameters: SendMessageSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof SendMessageSchema>,
    ) => {
      const client = resolveClient(clients);
      const result = await client.messages.sendMessage(
        params.chatId,
        params.text,
        params.replyTo,
      );
      return formatSuccess(
        `Message sent. ID: ${result.messageId}`,
        { messageId: String(result.messageId), chatId: result.chatId },
      );
    },
  };
}
