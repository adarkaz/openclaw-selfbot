import { Type, type Static } from "@sinclair/typebox";
import type { TelegramSelfBotClient } from "../../client.js";
import { resolveClient } from "../base.js";

const InvokeSchema = Type.Object(
  {
    method: Type.String({
      description:
        "MTProto API method name, e.g. 'messages.SendMessage', 'account.UpdateProfile', 'users.GetUsers', 'contacts.GetContacts', 'channels.GetChannels', 'messages.GetHistory', etc.",
    }),
    params: Type.Object(
      {},
      {
        additionalProperties: true,
        description:
          "Method parameters as key-value object. Consult Telegram API schema for required fields.",
      },
    ) as any,
  },
  { additionalProperties: false },
);

export function createInvokeTool(
  clients: Map<string, TelegramSelfBotClient>,
) {
  return {
    name: "tg_invoke",
    label: "Raw Telegram API Call",
    description:
      "Directly call any MTProto API method by name with raw parameters. Use for operations not covered by specialized tools. Returns parsed JSON result.",
    parameters: InvokeSchema,
    execute: async (
      _toolCallId: string,
      params: Static<typeof InvokeSchema>,
    ) => {
      const client = resolveClient(clients);
      const result = await client.rawInvoke(params.method, params.params);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        details: result,
      };
    },
  };
}
