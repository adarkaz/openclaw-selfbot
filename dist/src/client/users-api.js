import { Api } from "telegram";
export class UsersAPI {
    client;
    ensureConnected;
    constructor(client, ensureConnected) {
        this.client = client;
        this.ensureConnected = ensureConnected;
    }
    async getMe() {
        this.ensureConnected();
        const result = await this.client().invoke(new Api.users.GetUsers({ id: [new Api.InputUserSelf()] }));
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
//# sourceMappingURL=users-api.js.map