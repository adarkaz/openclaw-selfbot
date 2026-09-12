import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import type { TelegramMe, TelegramDialog } from "../types.js";
import { statSync } from "node:fs";
import { basename } from "node:path";

export class UsersAPI {
  constructor(
    private client: () => TelegramClient,
    private ensureConnected: () => void,
    private resolvePeer: (chatId: string) => Promise<Api.TypeInputPeer>,
  ) {}

  async getMe(): Promise<TelegramMe> {
    this.ensureConnected();
    const me: any = await this.client().getMe();
    return {
      id: String(me.id),
      firstName: me.firstName ?? "",
      lastName: me.lastName ?? undefined,
      username: me.username ?? undefined,
      phoneNumber: me.phone ?? undefined,
    };
  }

  async updateProfile(
    firstName?: string,
    lastName?: string,
    about?: string,
  ): Promise<TelegramMe> {
    this.ensureConnected();
    const result: any = await this.client().invoke(
      new Api.account.UpdateProfile({
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(about !== undefined ? { about } : {}),
      }),
    );
    // UpdateProfile returns a User; gramjs wraps it
    const user = result?.user ?? result;
    return {
      id: String(user.id),
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? undefined,
      username: user.username ?? undefined,
      phoneNumber: user.phone ?? undefined,
    };
  }

  async updateUsername(username: string): Promise<TelegramMe> {
    this.ensureConnected();
    const result: any = await this.client().invoke(
      new Api.account.UpdateUsername({ username }),
    );
    const user = result?.user ?? result;
    return {
      id: String(user.id),
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? undefined,
      username: user.username ?? undefined,
      phoneNumber: user.phone ?? undefined,
    };
  }

  async setAvatar(filePath: string): Promise<void> {
    this.ensureConnected();
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }
    try {
      const uploaded = await this.client().uploadFile({
        file: new CustomFile(basename(filePath), stat.size, filePath),
        workers: 1,
      });
      await this.client().invoke(
        new Api.photos.UploadProfilePhoto({
          file: uploaded,
        }),
      );
    } catch (err: any) {
      throw new Error(
        `Failed to set avatar: ${err?.message ?? String(err)}`.slice(
          0,
          200,
        ),
      );
    }
  }

  async setPersonalChannel(chatId: string): Promise<void> {
    this.ensureConnected();
    const peer = await this.resolvePeer(chatId);
    if (peer instanceof Api.InputPeerChannel) {
      await this.client().invoke(
        new Api.account.UpdatePersonalChannel({
          channel: new Api.InputChannel({
            channelId: peer.channelId,
            accessHash: peer.accessHash,
          }),
        }),
      );
    } else {
      throw new Error(
        "Only channels and supergroups (chatId starting with -100) can be set as personal channel",
      );
    }
  }

  async searchContacts(
    query: string,
    limit?: number,
  ): Promise<TelegramDialog[]> {
    this.ensureConnected();
    const contacts: any[] = await this.client().getContacts();
    const normalized = query.toLowerCase();
    return contacts
      .filter((c) => {
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ") + (c.username ?? "");
        return name.toLowerCase().includes(normalized);
      })
      .slice(0, limit ?? 10)
      .map((c) => ({
        id: String(c.id),
        name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.username || String(c.id),
        type: "direct" as const,
        unreadCount: 0,
      }));
  }
}
