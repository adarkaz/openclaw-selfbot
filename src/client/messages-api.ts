import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import type { TelegramMessage, SendResult } from "../types.js";

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

  async getMessages(
    chatId: string,
    limit?: number,
    offsetId?: number,
  ): Promise<TelegramMessage[]> {
    this.ensureConnected();
    const peer = await this.resolvePeer(chatId);
    const messages = await this.client().getMessages(peer, {
      limit: limit ?? 50,
      ...(offsetId ? { offsetId } : {}),
    });
    return messages
      .filter((m: any) => m != null)
      .map((m: any) => ({
        id: m.id,
        chatId,
        text: m.text || "",
        senderId: String(m.senderId ?? ""),
        senderName: (m.sender?.firstName ?? m.sender?.username ?? ""),
        date: m.date,
        isOutgoing: m.out ?? false,
        isReply: Boolean(m.isReply ?? m.replyToMsgId),
        replyToMsgId: m.replyToMsgId ?? undefined,
        media: m.media
          ? {
              type: m.media.className,
              fileId: (m.media as any)?.id?.toString(),
              mimeType: (m.media as any)?.mimeType,
            }
          : undefined,
      }));
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
