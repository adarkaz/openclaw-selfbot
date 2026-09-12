import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient, formatSuccess } from "../base.js";

const SendFileSchema = Type.Object(
  {
    chatId: Type.String({ description: "Target chat/group/channel ID" }),
    filePath: Type.String({ description: "Local file path to send" }),
    caption: Type.Optional(
      Type.String({ description: "Optional file caption" }),
    ),
  },
  { additionalProperties: false },
);

export function createSendFileTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_send_file",
    label: "Send Telegram File",
    description:
      "Send a file (photo, video, document) to a Telegram chat, group, or channel",
    parameters: SendFileSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof SendFileSchema>,
    ) => {
      const client = resolveClient(clients);
      const result = await client.files.sendFile(
        params.chatId,
        params.filePath,
        params.caption,
      );
      return formatSuccess(
        `File sent. Message ID: ${result.messageId}`,
        { messageId: String(result.messageId), chatId: result.chatId },
      );
    },
  };
}
