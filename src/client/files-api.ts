import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import type { SendResult } from "../types.js";

export class FilesAPI {
  constructor(
    private client: () => TelegramClient,
    private resolvePeer: (chatId: string) => Promise<Api.TypeInputPeer>,
    private ensureConnected: () => void,
  ) {}

  async sendFile(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<SendResult> {
    this.ensureConnected();
    const peer = await this.resolvePeer(chatId);
    const result: any = await this.client().sendFile(peer, {
      file: filePath,
      caption: caption ?? "",
      forceDocument: false,
    });
    const msgId =
      typeof result?.id === "number" ? result.id
      : result?.message?.id ?? result?.updates?.[0]?.message?.id ?? 0;
    return {
      messageId: Number(msgId),
      chatId,
      date: Number(result?.date ?? result?.message?.date ?? Math.floor(Date.now() / 1000)),
    };
  }
}
