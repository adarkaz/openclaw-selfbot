import { Api } from "telegram";
export class MessagesAPI {
    client;
    resolvePeer;
    ensureConnected;
    sendRawMessage;
    constructor(client, resolvePeer, ensureConnected, sendRawMessage) {
        this.client = client;
        this.resolvePeer = resolvePeer;
        this.ensureConnected = ensureConnected;
        this.sendRawMessage = sendRawMessage;
    }
    async sendMessage(chatId, text, replyTo) {
        const msg = await this.sendRawMessage(chatId, text, replyTo);
        return {
            messageId: msg.id,
            chatId: String(msg.chatId ?? chatId),
            date: msg.date ?? Math.floor(Date.now() / 1000),
        };
    }
    async sendTypingIndicator(chatId) {
        this.ensureConnected();
        await this.client().invoke(new Api.messages.SetTyping({
            peer: await this.resolvePeer(chatId),
            action: new Api.SendMessageTypingAction(),
        }));
    }
}
//# sourceMappingURL=messages-api.js.map