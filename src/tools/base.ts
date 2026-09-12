import type { TelegramSelfBotClient } from "../client.js";

export function resolveClient(
  clients: Map<string, TelegramSelfBotClient>,
  accountId?: string | null,
): TelegramSelfBotClient {
  const id = accountId ?? "default";
  const client = clients.get(id);
  if (!client) throw new Error(`No Telegram client for account ${id}`);
  return client;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
}

export function formatSuccess(text: string, details?: unknown): ToolResult {
  return { content: [{ type: "text", text }], details };
}

export function formatJson(data: unknown): ToolResult {
  return formatSuccess(JSON.stringify(data, null, 2), data);
}
