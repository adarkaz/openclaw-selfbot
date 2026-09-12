import { Type } from "@sinclair/typebox";
import { resolveClient } from "../base.js";
const InvokeSchema = Type.Object({
    method: Type.String({
        description: "MTProto API method name, e.g. 'messages.SendMessage', 'messages.GetHistory', 'messages.GetDialogs', 'messages.GetMessages', 'messages.ReadHistory', 'contacts.ResolveUsername', 'contacts.GetContacts', 'channels.GetChannels', 'users.GetUsers', 'users.GetFullUser', 'account.UpdateProfile', etc.",
    }),
    params: Type.Object({}, {
        additionalProperties: true,
        description: "Method parameters as key-value JSON. Nested TL objects use a snake_case '_' marker, e.g. {_: 'inputPeerSelf'} or {_: 'inputReplyToMessage', replyToMsgId: 5}. " +
            "For 'peer' fields you can pass a string shorthand instead of a full object: \"self\" (Saved Messages), a chat/user id like \"12345\" or \"-1001234567890\" (resolved from the cached dialogs), \"@username\", or \"+phone\". " +
            "To message a user not in cache: call contacts.ResolveUsername first to get userId + accessHash, then messages.SendMessage with peer {_: 'inputPeerUser', userId, accessHash}. " +
            "Consult the Telegram API schema for required fields of other methods.",
    }),
}, { additionalProperties: false });
export function createInvokeTool(clients) {
    return {
        name: "tg_invoke",
        label: "Raw Telegram API Call",
        description: "Directly call any MTProto Telegram API method by name with raw JSON parameters. This is the only Telegram tool — use it for everything: sending messages (messages.SendMessage), reading channel/chat history (messages.GetHistory), listing dialogs (messages.GetDialogs), fetching specific messages (messages.GetMessages), resolving users by username (contacts.ResolveUsername), marking chats as read (messages.ReadHistory), and any other Telegram operation. Nested objects use snake_case '_' markers (e.g. {_: 'inputPeerSelf'}) and 'peer' fields accept string shorthands (\"self\", chat id, @username, +phone). Returns the parsed JSON result.",
        parameters: InvokeSchema,
        execute: async (_toolCallId, params) => {
            const client = resolveClient(clients);
            const result = await client.rawInvoke(params.method, params.params);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                details: result,
            };
        },
    };
}
//# sourceMappingURL=invoke.js.map