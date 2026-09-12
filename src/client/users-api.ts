import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import type { TelegramMe } from "../types.js";

export class UsersAPI {
  constructor(
    private client: () => TelegramClient,
    private ensureConnected: () => void,
  ) {}

  async getMe(): Promise<TelegramMe> {
    this.ensureConnected();
    const result: any = await this.client().invoke(
      new Api.users.GetUsers({ id: [new Api.InputUserSelf()] }),
    );
    const me = Array.isArray(result)
      ? result[0]
      : result?.users?.[0] ?? result;
    if (!me || me.className === "UserEmpty") {
      throw new Error("Could not resolve own user (users.GetUsers)");
    }
    return {
      id: String(me.id),
      firstName: me.firstName ?? "",
      lastName: me.lastName ?? undefined,
      username: me.username ?? undefined,
      phoneNumber: me.phone ?? undefined,
    };
  }
}
