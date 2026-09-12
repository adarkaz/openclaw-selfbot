export function resolveClient(clients, accountId) {
    const id = accountId ?? "default";
    const client = clients.get(id);
    if (!client)
        throw new Error(`No Telegram client for account ${id}`);
    return client;
}
export function formatSuccess(text, details) {
    return { content: [{ type: "text", text }], details };
}
export function formatJson(data) {
    return formatSuccess(JSON.stringify(data, null, 2), data);
}
//# sourceMappingURL=base.js.map