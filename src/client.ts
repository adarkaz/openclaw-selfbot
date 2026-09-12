import { TelegramClient, utils } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram";
import { NewMessage } from "telegram/events";
import type {
  InboundTelegramMessage,
  TelegramDialog,
  TelegramMe,
  SendResult,
} from "./types.js";
import { MessagesAPI } from "./client/messages-api.js";
import { DialogsAPI } from "./client/dialogs-api.js";
import { UsersAPI } from "./client/users-api.js";
import { FilesAPI } from "./client/files-api.js";

type ConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type MessageHandler = (msg: InboundTelegramMessage) => void;

export class TelegramSelfBotClient {
  public readonly accountId: string;
  public readonly messages: MessagesAPI;
  public readonly dialogs: DialogsAPI;
  public readonly users: UsersAPI;
  public readonly files: FilesAPI;

  private _client: TelegramClient | null = null;
  private session: StringSession;
  private state: ConnectionState = "new";
  private connectPromise: Promise<void> | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private peerCache: Map<string, Api.TypeInputPeer> = new Map();
  private userInfoCache: Map<
    string,
    { firstName?: string; lastName?: string; username?: string }
  > = new Map();
  private _pendingLookups: Set<string> = new Set();
  private readReceiptQueue: Map<string, number> = new Map();
  private readReceiptTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 5000;

  constructor(
    private config: {
      apiId: number;
      apiHash: string;
      phoneNumber: string;
      sessionString?: string;
      password?: string;
    },
    accountId: string,
  ) {
    this.accountId = accountId;
    this.session = new StringSession(config.sessionString ?? "");

    // Build API helpers bound to this instance.
    // Arrow functions close over `this` so methods work post-construction.
    const rawClient = () => this._client!;
    const ensureConnected = () => this.ensureConnected();
    const resolvePeer = (chatId: string) => this.resolvePeer(chatId);
    const sendRaw = (
      chatId: string,
      text: string,
      replyTo?: number,
      isRetry?: boolean,
    ) => this.sendRawMessage(chatId, text, replyTo, isRetry);
    const formatDlg = (d: any) => this.formatDialog(d);

    this.messages = new MessagesAPI(
      rawClient,
      resolvePeer,
      ensureConnected,
      sendRaw,
    );
    this.dialogs = new DialogsAPI(rawClient, ensureConnected, formatDlg);
    this.users = new UsersAPI(rawClient, ensureConnected, resolvePeer);
    this.files = new FilesAPI(rawClient, resolvePeer, ensureConnected);
  }

  get connected(): boolean {
    return this.state === "connected";
  }

  get currentState(): ConnectionState {
    return this.state;
  }

  // ---- Connection lifecycle ----

  async connect(interactiveAuth?: {
    onCodeRequest: () => Promise<string>;
    onPasswordRequest: () => Promise<string>;
  }): Promise<void> {
    if (this.state === "connected") return;
    if (this.connectPromise) return this.connectPromise;

    this.state = "connecting";
    this.connectPromise = this._doConnect(interactiveAuth).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    this._stopReadReceiptTimer();
    if (this._client) {
      try {
        await this._client.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this._client = null;
    }
    this.state = "disconnected";
    this.messageHandlers.clear();
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  getSessionString(): string {
    return this.session.save() as unknown as string;
  }

  /** Raw MTProto API call — agent-facing. Resolves Api.* constructor from dotted name. */
  async rawInvoke(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    this.ensureConnected();
    let apiClass: any = Api;
    for (const part of method.split(".")) {
      apiClass = apiClass[part];
    }
    if (typeof apiClass !== "function") {
      throw new Error(`Unknown API method: ${method}`);
    }
    return this._client!.invoke(new apiClass(params));
  }

  // ---- Peer cache access (for external API use) ----

  /** Expose peer cache so API modules can use the same cache. */
  getPeerCache(): Map<string, Api.TypeInputPeer> {
    return this.peerCache;
  }

  // ---- Public API helpers (used internally and by domain API classes) ----

  ensureConnected(): void {
    if (this.state !== "connected" || !this._client) {
      throw new Error(
        `Client not connected (state: ${this.state}). Call connect() first.`,
      );
    }
  }

  /** Resolve a chatId string into an InputPeer for gramjs API calls. */
  async resolvePeer(chatId: string): Promise<Api.TypeInputPeer> {
    // 1) Own cache (populated from inbound events + dialogs preload)
    const cached = this.peerCache.get(chatId);
    if (cached) return cached;

    // 2) gramjs getInputEntity (entity cache → session → network)
    const numId = Number(chatId);
    try {
      const peer = await this._client!.getInputEntity(
        isNaN(numId) ? chatId : numId,
      );
      if (peer) {
        this.peerCache.set(chatId, peer);
        return peer;
      }
    } catch {
      // expected for self-bots — fall through
    }

    // 3) Username resolution
    if (chatId.startsWith("@")) {
      return this._resolveByUsername(chatId);
    }

    // 4) Phone number resolution
    if (chatId.startsWith("+")) {
      return this._resolveByPhone(chatId);
    }

    // 5) Network fallback: users.GetUsers / channels.GetChannels
    const peer = await this._resolveById(chatId);
    if (peer) {
      this.peerCache.set(chatId, peer);
      return peer;
    }

    throw new Error(
      `Cannot resolve peer "${chatId}". The chat is not in your dialogs ` +
        `and could not be found. Try a username (@example) or ensure ` +
        `you have an existing conversation with this peer.`,
    );
  }

  /** Send text via raw API, bypassing gramjs's broken getMessageId. */
  async sendRawMessage(
    chatId: string,
    text: string,
    replyTo?: number,
    isRetry = false,
  ): Promise<{ id: number; chatId?: number; date?: number }> {
    const peer = await this.resolvePeer(chatId);
    try {
      const result: any = await this._client!.invoke(
        new Api.messages.SendMessage({
          peer,
          message: text,
          randomId: BigInt(
            Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
          ),
          ...(replyTo
            ? { replyTo: new Api.InputReplyToMessage({ replyToMsgId: replyTo }) }
            : {}),
        }),
      );
      const msg =
        result?.updates?.find(
          (u: any) =>
            u.className === "UpdateNewMessage" ||
            u.className === "UpdateNewChannelMessage",
        )?.message ??
        result?.updates?.[0]?.message ??
        result;
      return { id: Number(msg.id), chatId: msg.chatId, date: msg.date };
    } catch (err: any) {
      if (
        !isRetry &&
        err?.code === 400 &&
        err?.message === "PEER_ID_INVALID"
      ) {
        this.peerCache.delete(chatId);
        return this.sendRawMessage(chatId, text, replyTo, true);
      }
      throw err;
    }
  }

  /** Format a raw gramjs dialog into our typed shape. */
  formatDialog(d: any): TelegramDialog {
    const entity = d.entity;
    let name = "";
    let type: TelegramDialog["type"] = "direct";
    if (entity) {
      if ("title" in entity && entity.title) {
        name = entity.title;
        type = entity.megagroup
          ? "group"
          : entity.broadcast
            ? "channel"
            : "group";
      } else if ("firstName" in entity) {
        name =
          [entity.firstName, entity.lastName].filter(Boolean).join(" ") ||
          entity.username ||
          String(entity.id);
        type = entity.bot ? "bot" : "direct";
      }
    }
    return {
      id: String(d.id),
      name,
      type,
      unreadCount: d.unreadCount,
      lastMessage: d.message
        ? {
            text: d.message.text || "",
            date: d.message.date,
            isOutgoing: d.message.out ?? false,
          }
        : undefined,
    };
  }

  // ---- Infrastructure (read receipts, typing) stay on client ----

  async sendTypingIndicator(chatId: string): Promise<void> {
    this.ensureConnected();
    await this._client!.invoke(
      new Api.messages.SetTyping({
        peer: await this.resolvePeer(chatId),
        action: new Api.SendMessageTypingAction(),
      }),
    );
  }

  async markAsRead(chatId: string, messageId: number): Promise<void> {
    const current = this.readReceiptQueue.get(chatId);
    if (current === undefined || messageId > current) {
      this.readReceiptQueue.set(chatId, messageId);
    }
  }

  async flushReadReceipts(): Promise<void> {
    await this._flushReadReceipts();
  }

  // ---- Internal helpers ----

  private async _doConnect(interactiveAuth?: {
    onCodeRequest: () => Promise<string>;
    onPasswordRequest: () => Promise<string>;
  }): Promise<void> {
    try {
      this._client = new TelegramClient(
        this.session,
        this.config.apiId,
        this.config.apiHash,
        {
          connectionRetries: 3,
          useWSS: true,
        },
      );

      await this._client.connect();

      if (!(await this._client.isUserAuthorized())) {
        if (!interactiveAuth) {
          throw new Error(
            "User not authorized and no interactive auth callbacks provided",
          );
        }

        await this._client.start({
          phoneNumber: this.config.phoneNumber,
          phoneCode: interactiveAuth.onCodeRequest,
          password: this.config.password
            ? () => Promise.resolve(this.config.password)
            : interactiveAuth.onPasswordRequest,
        });

        const sessionStr = this.session.save() as unknown as string;
        this.config.sessionString = sessionStr;
      }

      this.state = "connected";
      this.reconnectAttempts = 0;
      this._client.addEventHandler(
        this._handleEvent.bind(this),
        new NewMessage({}),
      );

      await this._preloadDialogs();
      this._startReadReceiptTimer();
    } catch (err) {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.state = "reconnecting";
        const delay =
          this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this._doConnect(interactiveAuth);
      }
      this.state = "disconnected";
      throw err;
    }
  }

  private _startReadReceiptTimer(): void {
    this._stopReadReceiptTimer();
    this.readReceiptTimer = setInterval(() => {
      this._flushReadReceipts();
    }, 30_000);
  }

  private _stopReadReceiptTimer(): void {
    if (this.readReceiptTimer) {
      clearInterval(this.readReceiptTimer);
      this.readReceiptTimer = null;
    }
  }

  private async _flushReadReceipts(): Promise<void> {
    if (this.readReceiptQueue.size === 0) return;
    if (this.state !== "connected" || !this._client) return;
    const entries = [...this.readReceiptQueue.entries()];
    this.readReceiptQueue.clear();
    for (const [chatId, maxId] of entries) {
      try {
        const peer = await this.resolvePeer(chatId);
        await this._client.invoke(
          new Api.messages.ReadHistory({ peer, maxId }),
        );
      } catch {
        const current = this.readReceiptQueue.get(chatId);
        if (current === undefined || maxId > current) {
          this.readReceiptQueue.set(chatId, maxId);
        }
      }
    }
  }

  /** Preload all dialogs to populate peerCache with valid accessHashes. */
  private async _preloadDialogs(): Promise<void> {
    try {
      const dialogs = await this._client!.getDialogs({ limit: 200 });
      let cached = 0;
      for (const d of dialogs) {
        try {
          if (!d.entity) continue;
          const inputPeer = utils.getInputPeer(d.entity);
          const peerId = utils.getPeerId(d.entity);
          if (!this.peerCache.has(peerId)) {
            this.peerCache.set(peerId, inputPeer);
            cached++;
          }
          // Cache user info for sender display names
          if (
            "firstName" in d.entity &&
            !this.userInfoCache.has(peerId)
          ) {
            const e = d.entity as Record<string, unknown>;
            this.userInfoCache.set(peerId, {
              firstName: (e.firstName as string) || undefined,
              lastName: (e.lastName as string) || undefined,
              username: (e.username as string) || undefined,
            });
          }
        } catch {
          // skip unresolvable entities
        }
      }
      console.log(
        "[telegram-selfbot] _preloadDialogs: cached %d peers, %d user infos",
        cached,
        this.userInfoCache.size,
      );
    } catch (err) {
      console.error("[telegram-selfbot] _preloadDialogs failed:", err);
    }
  }

  /** Background lookup to fill userInfoCache for senders not in preloaded dialogs. */
  private _lookupUserInfo(senderId: string): void {
    if (this._pendingLookups.has(senderId)) return;
    this._pendingLookups.add(senderId);
    const client = this._client;
    if (!client) {
      this._pendingLookups.delete(senderId);
      return;
    }
    try {
      const userId = BigInt(senderId);
      client
        .invoke(
          new Api.users.GetUsers({
            id: [new Api.InputUser({ userId, accessHash: 0n })],
          }),
        )
        .then((result: any) => {
          if (result?.length && result[0].className !== "UserEmpty") {
            const user = result[0];
            this.userInfoCache.set(senderId, {
              firstName: user.firstName || undefined,
              lastName: user.lastName || undefined,
              username: user.username || undefined,
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          this._pendingLookups.delete(senderId);
        });
    } catch {
      this._pendingLookups.delete(senderId);
    }
  }

  private async _resolveByUsername(
    username: string,
  ): Promise<Api.TypeInputPeer> {
    const result: any = await this._client!.invoke(
      new Api.contacts.ResolveUsername({ username: username.slice(1) }),
    );
    if (result.users?.length) {
      const user = result.users[0];
      const peer = new Api.InputPeerUser({
        userId: user.id,
        accessHash: user.accessHash ?? 0n,
      });
      const key = String(user.id);
      this.peerCache.set(key, peer);
      this.peerCache.set(username, peer);
      return peer;
    }
    if (result.chats?.length) {
      const chat = result.chats[0];
      const isChannel = chat.className === "Channel";
      const peer = isChannel
        ? new Api.InputPeerChannel({
            channelId: chat.id,
            accessHash: chat.accessHash ?? 0n,
          })
        : new Api.InputPeerChat({ chatId: chat.id });
      const key = isChannel ? "-100" + chat.id : "-" + chat.id;
      this.peerCache.set(key, peer);
      this.peerCache.set(username, peer);
      return peer;
    }
    throw new Error(`Username "${username}" not found`);
  }

  private async _resolveByPhone(phone: string): Promise<Api.TypeInputPeer> {
    const result: any = await this._client!.invoke(
      new Api.contacts.GetContacts({ hash: 0n }),
    );
    const normalizedPhone = phone.slice(1);
    if (result.users) {
      for (const user of result.users) {
        if (user.phone === normalizedPhone) {
          const peer = new Api.InputPeerUser({
            userId: user.id,
            accessHash: user.accessHash ?? 0n,
          });
          const key = String(user.id);
          this.peerCache.set(key, peer);
          this.peerCache.set(phone, peer);
          return peer;
        }
      }
    }
    throw new Error(`Phone "${phone}" not found in contacts`);
  }

  private async _resolveById(
    chatId: string,
  ): Promise<Api.TypeInputPeer | null> {
    if (chatId.startsWith("-100")) {
      const channelId = BigInt(chatId.slice(4));
      try {
        const result: any = await this._client!.invoke(
          new Api.channels.GetChannels({
            id: [new Api.InputChannel({ channelId, accessHash: 0n })],
          }),
        );
        if (result.chats?.length) {
          const chat = result.chats[0];
          if (chat.className === "Channel" || chat.className === "Chat") {
            const peer =
              chat.className === "Channel"
                ? new Api.InputPeerChannel({
                    channelId: chat.id,
                    accessHash: chat.accessHash ?? 0n,
                  })
                : new Api.InputPeerChat({ chatId: chat.id });
            const key = "-100" + chat.id;
            this.peerCache.set(key, peer);
            return peer;
          }
        }
      } catch {
        // channel not accessible
      }
    } else if (chatId.startsWith("-")) {
      return new Api.InputPeerChat({ chatId: BigInt(chatId) });
    } else {
      try {
        const userId = BigInt(chatId);
        const result: any = await this._client!.invoke(
          new Api.users.GetUsers({
            id: [new Api.InputUser({ userId, accessHash: 0n })],
          }),
        );
        if (result?.length && result[0].className !== "UserEmpty") {
          const user = result[0];
          const peer = new Api.InputPeerUser({
            userId: user.id,
            accessHash: user.accessHash ?? 0n,
          });
          this.peerCache.set(String(user.id), peer);
          return peer;
        }
      } catch {
        // user not found / not a contact
      }
    }
    return null;
  }

  private _handleEvent(event: any): void {
    const msg = event?.message;
    if (!msg || msg.out) return;

    try {
      const sender = (event as any)._sender;
      if (sender && sender.id) {
        const sid = String(sender.id);
        const hash =
          typeof sender.accessHash === "bigint" ? sender.accessHash : 0n;
        this.peerCache.set(
          sid,
          new Api.InputPeerUser({ userId: BigInt(sid), accessHash: hash }),
        );
      }
      const chatEntity = (event as any)._chat;
      if (chatEntity && chatEntity.id) {
        const cid = String(chatEntity.id);
        const hash =
          typeof chatEntity.accessHash === "bigint"
            ? chatEntity.accessHash
            : undefined;
        if (hash !== undefined) {
          this.peerCache.set(
            "-100" + cid,
            new Api.InputPeerChannel({
              channelId: BigInt(cid),
              accessHash: hash,
            }),
          );
        } else {
          this.peerCache.set(
            "-" + cid,
            new Api.InputPeerChat({ chatId: BigInt(cid) }),
          );
        }
      }

      // Resolve chatId: prefer _chat entity for groups/channels,
      // fall back to msg.peerId for DMs (more reliable for self-bots).
      const chatId = (() => {
        try {
          if (chatEntity) {
            const cid = String(chatEntity.id);
            if (chatEntity.className === "Channel") return "-100" + cid;
            if (chatEntity.className === "Chat") return "-" + cid;
          }
          if (msg.peerId) return utils.getPeerId(msg.peerId);
          return String(msg.chatId ?? "");
        } catch {
          return String(msg.chatId ?? "");
        }
      })();
      const isGroup = Boolean(
        chatEntity ||
          msg.peerId?.className === "PeerChat" ||
          msg.peerId?.className === "PeerChannel",
      );

      const senderId = String(
        sender?.id ?? msg.senderId ?? msg.fromId?.userId ?? "",
      );

      // Cache user info from _sender (when available) or trigger background lookup
      if (senderId && sender?.id) {
        if (sender.firstName || sender.lastName || sender.username) {
          this.userInfoCache.set(senderId, {
            firstName: (sender.firstName as string) || undefined,
            lastName: (sender.lastName as string) || undefined,
            username: (sender.username as string) || undefined,
          });
        } else if (!this.userInfoCache.has(senderId)) {
          // Background lookup for new users not in cache
          this._lookupUserInfo(senderId);
        }
      }
      const cached = this.userInfoCache.get(senderId);

      const firstName = sender?.firstName || cached?.firstName || undefined;
      const lastName = sender?.lastName || cached?.lastName || undefined;
      const username = sender?.username || cached?.username || undefined;

      const senderDisplayName =
        [firstName, lastName].filter(Boolean).join(" ") ||
        username ||
        "";

      const rawText = msg.text || msg.message || "";

      const inbound: InboundTelegramMessage = {
        id: msg.id,
        chatId,
        text: rawText,
        rawText,
        senderId,
        senderName: senderDisplayName || undefined,
        senderUsername: username,
        isGroup,
        isReply: Boolean(msg.isReply ?? msg.replyToMsgId),
        replyToMsgId: msg.replyToMsgId ?? undefined,
        date: msg.date ?? Math.floor(Date.now() / 1000),
        media: msg.media
          ? {
              type: msg.media.className
                ?.replace("MessageMedia", "")
                .toLowerCase() ?? "unknown",
              fileId: (msg.media as any)?.id?.toString(),
              mimeType: (msg.media as any)?.mimeType,
            }
          : undefined,
      };

      for (const handler of this.messageHandlers) {
        handler(inbound);
      }
    } catch (err) {
      console.error("[telegram-selfbot] event handler error:", err);
    }
  }
}
