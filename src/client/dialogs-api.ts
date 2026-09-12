import type { TelegramClient } from "telegram";
import type { TelegramDialog } from "../types.js";

export class DialogsAPI {
  constructor(
    private client: () => TelegramClient,
    private ensureConnected: () => void,
    private formatDialog: (d: Record<string, unknown>) => TelegramDialog,
  ) {}

  async getDialogs(limit?: number): Promise<TelegramDialog[]> {
    this.ensureConnected();
    const dialogs = await this.client().getDialogs({ limit: limit ?? 20 });
    return dialogs.map((d) => this.formatDialog(d));
  }
}
