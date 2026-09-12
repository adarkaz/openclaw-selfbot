import { TelegramClient, utils } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram";
import { NewMessage } from "telegram/events";
import type { InboundTelegramMessage } from "./types.js";
import { MessagesAPI } from "./client/messages-api.js";
import { UsersAPI } from "./client/users-api.js";
import { FilesAPI } from "./client/files-api.js";

type ConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

/**
 * gramjs's generated .d.ts types int128/int256 fields as big-integer's
 * BigInteger class, but the runtime accepts native bigint (verified).
 * Wrap native bigints at TL constructor call sites.
 */
const tlBigInt = (v: bigint): any => v;

/**
 * Recursively convert plain JSON params into gramjs TL objects.
 * Nested objects marked with a snake_case "_" key ("inputPeerSelf",
 * "inputReplyToMessage", …) become Api.* constructor instances; gramjs does
 * NOT do this itself (plain objects fail serialization).
 */
function hydrateTlParams(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(hydrateTlParams);
  if (v && typeof v === "object") {
    if (
      v instanceof Date ||
      v instanceof Uint8Array ||
      typeof (v as any).getBytes === "function"
    ) {
      return v; // already a TLObject / Buffer / Date — pass through
    }
    if (typeof (v as any)._ === "string" && (v as any)._ !== "") {
      const cls = (v as any)._
        .split("_")
        .map((s: string) => s[0].toUpperCase() + s.slice(1))
        .join("");
      const Ctor = (Api as any)[cls];
      if (typeof Ctor !== "function") {
        throw new Error(`Unknown TL class: ${(v as any)._}`);
      }
      const { _: __, ...rest } = v as any;
      return new Ctor(hydrateTlParams(rest));
    }
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as any)) {
      out[k] = hydrateTlParams(val);
    }
    return out;
  }
  return v;
}

export type MessageHandler = (msg: InboundTelegramMessage) => void;

export class TelegramSelfBotClient {
  public readonly accountId: string;
  public readonly messages: MessagesAPI;
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

    this.messages = new MessagesAPI(
      rawClient,
      resolvePeer,
      ensureConnected,
      sendRaw,
    );
    this.users = new UsersAPI(rawClient, ensureConnected);
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
    const hydrated: any = hydrateTlParams(params);
    await this._autofillPeers(hydrated);
    return this._client!.invoke(new apiClass(hydrated));
  }

  /**
   * Fill in peers the agent referenced loosely:
   *  - string on peer/fromPeer/toPeer keys → resolvePeer ("self", id, @username, +phone)
   *  - inputPeerUser/Chat/Channel objects missing accessHash → peerCache,
   *    anywhere in the tree (direct values, array elements, `id` arrays)
   */
  private async _autofillPeers(value: any): Promise<any> {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        value[i] = await this._autofillPeers(value[i]);
      }
      return value;
    }
    if (value && typeof value === "object") {
      const ownClassName = (value as any).className;
      if (
        typeof ownClassName === "string" &&
        ["InputPeerUser", "InputPeerChat", "InputPeerChannel"].includes(
          ownClassName,
        ) &&
        (value as any).accessHash === undefined
      ) {
        const id = String(
          (value as any).userId ??
            (value as any).chatId ??
            (value as any).channelId ??
            "",
        );
        const cached = id ? this.peerCache.get(id) : undefined;
        if (cached && (cached as any).className === ownClassName) {
          return cached;
        }
      }
      for (const [k, v] of Object.entries(value)) {
        if (
          (k === "peer" || k === "fromPeer" || k === "toPeer") &&
          typeof v === "string"
        ) {
          value[k] = await this.resolvePeer(v);
          continue;
        }
        value[k] = await this._autofillPeers(v);
      }
    }
    return value;
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
    // 0) Self / Saved Messages
    if (chatId === "self" || chatId === "me") {
      return new Api.InputPeerSelf();
    }

    // 1) Own cache (populated from inbound events + dialogs preload)
    const cached = this.peerCache.get(chatId);
    if (cached) return cached;

    // 2) Username resolution
    if (chatId.startsWith("@")) {
      return this._resolveByUsername(chatId);
    }

    // 3) Phone number resolution
    if (chatId.startsWith("+")) {
      return this._resolveByPhone(chatId);
    }

    // 4) Network fallback: users.GetUsers / channels.GetChannels
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
          randomId: tlBigInt(
            BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
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
            ? () => Promise.resolve(this.config.password!)
            : interactiveAuth.onPasswordRequest,
          onError: (err: Error) => {
            throw err;
          },
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

  /**
   * Preload all dialogs (raw Api.messages.GetDialogs) to populate
   * peerCache with valid InputPeers + userInfoCache with display names.
   */
  private async _preloadDialogs(): Promise<void> {
    try {
      const result: any = await this._client!.invoke(
        new Api.messages.GetDialogs({
          offsetDate: 0,
          offsetId: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          limit: 200,
          hash: tlBigInt(0n),
        }),
      );

      const usersById = new Map<string, any>();
      for (const u of result.users ?? []) {
        usersById.set(String(u.id), u);
      }
      const chatsById = new Map<string, any>();
      for (const c of result.chats ?? []) {
        chatsById.set(String(c.id), c);
      }

      let cached = 0;
      for (const d of result.dialogs ?? []) {
        try {
          const peer = d.peer;
          let inputPeer: Api.TypeInputPeer | null = null;
          let key = "";
          let entity: any = null;

          if (peer?.className === "PeerUser") {
            entity = usersById.get(String(peer.userId));
            if (entity) {
              key = String(entity.id);
              inputPeer = new Api.InputPeerUser({
                userId: entity.id,
                accessHash: entity.accessHash ?? 0n,
              });
            }
          } else if (peer?.className === "PeerChat") {
            entity = chatsById.get(String(peer.chatId));
            if (entity) {
              key = "-" + entity.id;
              inputPeer = new Api.InputPeerChat({ chatId: entity.id });
            }
          } else if (peer?.className === "PeerChannel") {
            entity = chatsById.get(String(peer.channelId));
            if (entity) {
              key = "-100" + entity.id;
              inputPeer = new Api.InputPeerChannel({
                channelId: entity.id,
                accessHash: entity.accessHash ?? 0n,
              });
            }
          }

          if (inputPeer && key && !this.peerCache.has(key)) {
            this.peerCache.set(key, inputPeer);
            cached++;
          }

          // Cache user info for sender display names
          if (entity?.firstName && !this.userInfoCache.has(key)) {
            this.userInfoCache.set(key, {
              firstName: entity.firstName || undefined,
              lastName: entity.lastName || undefined,
              username: entity.username || undefined,
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
            id: [
              new Api.InputUser({
                userId: tlBigInt(userId),
                accessHash: tlBigInt(0n),
              }),
            ],
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
      new Api.contacts.GetContacts({ hash: tlBigInt(0n) }),
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
            id: [
              new Api.InputChannel({
                channelId: tlBigInt(channelId),
                accessHash: tlBigInt(0n),
              }),
            ],
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
      return new Api.InputPeerChat({ chatId: tlBigInt(BigInt(chatId)) });
    } else {
      try {
        const userId = BigInt(chatId);
        const result: any = await this._client!.invoke(
          new Api.users.GetUsers({
            id: [
              new Api.InputUser({
                userId: tlBigInt(userId),
                accessHash: tlBigInt(0n),
              }),
            ],
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
          new Api.InputPeerUser({ userId: tlBigInt(BigInt(sid)), accessHash: hash }),
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
              channelId: tlBigInt(BigInt(cid)),
              accessHash: hash,
            }),
          );
        } else {
          this.peerCache.set(
            "-" + cid,
            new Api.InputPeerChat({ chatId: tlBigInt(BigInt(cid)) }),
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
