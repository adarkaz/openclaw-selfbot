import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import type { SendResult } from "../types.js";

export class MessagesAPI {
  constructor(
    private client: () => TelegramClient,
    private resolvePeer: (chatId: string) => Promise<Api.TypeInputPeer>,
    private ensureConnected: () => void,
    private sendRawMessage: (
      chatId: string,
      text: string,
      replyTo?: number,
      isRetry?: boolean,
    ) => Promise<{ id: number; chatId?: number; date?: number }>,
  ) {}

  async sendMessage(
    chatId: string,
    text: string,
    replyTo?: number,
  ): Promise<SendResult> {
    const msg = await this.sendRawMessage(chatId, text, replyTo);
    return {
      messageId: msg.id,
      chatId: String(msg.chatId ?? chatId),
      date: msg.date ?? Math.floor(Date.now() / 1000),
    };
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    this.ensureConnected();
    await this.client().invoke(
      new Api.messages.SetTyping({
        peer: await this.resolvePeer(chatId),
        action: new Api.SendMessageTypingAction(),
      }),
    );
  }
}
