import { EventEmitter } from "node:events";
import type {
  ChatMessage,
  ZulipChannel,
  ZulipChannelFolder,
  ZulipDmConversation,
  ZulipTopic,
  ZulipUser,
  ZulipUserGroup,
} from "@atrium/shared";

// Inlined from @atrium/shared. That package ships TS source and cannot be
// `require`d at runtime by the compiled server (same reason submissions.ts
// inlines SUBMISSION_RESOURCES). MUST stay byte-identical to shared's
// participantKey so server- and web-derived DM conversation keys match.
function participantKey(ids: number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}

// Fixed Zulip Cloud realm for the Gnosis Research Center org.
export const ZULIP_REALM = "https://grc.zulipchat.com";
const API_BASE = `${ZULIP_REALM}/api/v1`;

// Event types we register for. Keep this minimal — every type adds queue churn.
// update_message_flags carries live "read" flag changes (e.g. read on mobile) so
// unread counts can converge across devices.
const EVENT_TYPES = [
  "message",
  "update_message",
  "reaction",
  "presence",
  "update_message_flags",
] as const;

function basicAuthHeader(email: string, apiKey: string): string {
  return "Basic " + Buffer.from(`${email}:${apiKey}`).toString("base64");
}

// ───── Raw Zulip wire shapes (only the fields we read) ─────
interface ZulipRawMessage {
  id: number;
  sender_id: number;
  sender_full_name: string;
  sender_email: string;
  avatar_url: string | null;
  content: string;
  timestamp: number; // epoch SECONDS
  stream_id?: number;
  subject?: string; // topic name (Zulip's legacy field name for topic)
  type: string; // "stream" | "private"
  // For private (direct) messages, the recipients are an array of user objects.
  // Zulip's older formats sometimes send a comma-string; we only read the array.
  display_recipient?: Array<{ id: number; email: string; full_name: string }> | string;
}

interface ZulipMember {
  user_id: number;
  email: string;
  full_name: string;
  avatar_url: string | null;
  is_bot: boolean;
  is_active: boolean;
}

interface ZulipSubscription {
  stream_id: number;
  name: string;
  description?: string;
  // Zulip 11+ channel-folder membership; absent on older realms.
  folder_id?: number | null;
}

interface ZulipStream {
  stream_id: number;
  name: string;
  description?: string;
  folder_id?: number | null;
}

interface ZulipChannelFolderRaw {
  id: number;
  name: string;
  order?: number;
  is_archived?: boolean;
}

interface ZulipTopicRaw {
  name: string;
  max_id: number;
}

interface ZulipEvent {
  id: number;
  type: string;
  op?: string;
  message?: ZulipRawMessage;
  // reaction event fields
  message_id?: number;
  emoji_name?: string;
  user_id?: number;
  // update_message_flags fields
  flag?: string;
  messages?: number[];
}

// Zulip /register `unread_msgs`: the user's current unread state, the most
// trustworthy source for seeding unread counts (survives reload + cross-device).
interface ZulipUnreadMsgs {
  pms?: Array<{ other_user_id?: number; sender_id?: number; unread_message_ids: number[] }>;
  streams?: Array<{ stream_id: number; topic: string; unread_message_ids: number[] }>;
  huddles?: Array<{ user_ids_string: string; unread_message_ids: number[] }>;
}

/**
 * Build the conversation title for a DM from a raw message's display_recipient,
 * excluding self. "Alice" for 1:1, "Alice, Bob" for a group, "You" for a
 * note-to-self. Shared by the conversation list and the live dm dispatch so the
 * two never disagree.
 */
function dmTitle(m: ZulipRawMessage, selfUserId: number): string {
  const dr = Array.isArray(m.display_recipient) ? m.display_recipient : [];
  const others = dr.filter((u) => u.id !== selfUserId);
  if (others.length === 0) return "You";
  return others.map((u) => u.full_name).join(", ");
}

/** Convert a raw Zulip message into the shared ChatMessage shape. */
function toChatMessage(m: ZulipRawMessage): ChatMessage {
  return {
    id: String(m.id),
    body: m.content,
    // Zulip timestamps are epoch SECONDS — convert to ISO milliseconds.
    createdAt: new Date(m.timestamp * 1000).toISOString(),
    recipientId: null,
    sender: {
      id: `zulip:${m.sender_id}`,
      name: m.sender_full_name,
      email: m.sender_email,
      imageUrl: m.avatar_url ?? undefined,
    },
  };
}

/**
 * Validate an API key by calling GET /users/me. Returns the Zulip user id +
 * canonical email on success, or null on auth failure. Never logs the key.
 */
export async function validateZulipKey(
  email: string,
  apiKey: string,
): Promise<{ userId: number; email: string; fullName: string } | null> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: basicAuthHeader(email, apiKey) },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json()) as {
    result: string;
    user_id?: number;
    email?: string;
    full_name?: string;
    delivery_email?: string;
  };
  if (body.result !== "success" || typeof body.user_id !== "number") return null;
  return {
    userId: body.user_id,
    email: body.delivery_email ?? body.email ?? email,
    fullName: body.full_name ?? email,
  };
}

export interface ZulipQueueClientEvents {
  connected: () => void;
  disconnected: () => void;
  error: (message: string) => void;
  message: (payload: { channelId: number; topicName: string; message: ChatMessage }) => void;
  reaction: (payload: {
    channelId: number;
    topicName: string;
    messageId: number;
    emojiName: string;
    userId: number;
    op: "add" | "remove";
  }) => void;
  dm: (payload: {
    participantKey: string;
    participantIds: number[];
    title: string;
    message: ChatMessage;
  }) => void;
  // Zulip-grounded unread state from /register's unread_msgs, normalized to the
  // app's keys (channel topics `${channelId}:${topicName}`, DMs participantKey).
  "unread-snapshot": (payload: { topics: string[]; dms: string[] }) => void;
  // Best-effort live read-flag sync (update_message_flags flag:"read" op:"add").
  "read-flags": (payload: { topics?: string[]; dms?: string[] }) => void;
}

/**
 * Per-user Zulip client: REST helpers + a long-poll event loop. One instance
 * per linked Atrium user (see ZulipManager). Emits typed events the manager
 * fans out to that user's sockets only.
 */
export class ZulipQueueClient extends EventEmitter {
  private readonly auth: string;
  private queueId: string | null = null;
  private lastEventId = -1;
  private running = false;
  private abort: AbortController | null = null;

  constructor(
    private readonly email: string,
    apiKey: string,
    // This client's own Zulip user id. Used to build the full participant set
    // for direct messages so server-emitted keys match client-requested keys.
    private readonly selfUserId: number,
  ) {
    super();
    this.auth = basicAuthHeader(email, apiKey);
  }

  override on<K extends keyof ZulipQueueClientEvents>(event: K, listener: ZulipQueueClientEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
  override emit<K extends keyof ZulipQueueClientEvents>(
    event: K,
    ...args: Parameters<ZulipQueueClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  private async request(
    path: string,
    init: { method?: string; body?: URLSearchParams; signal?: AbortSignal } = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: this.auth };
    if (init.body) headers["Content-Type"] = "application/x-www-form-urlencoded";
    const res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
      signal: init.signal,
    });
    const json = (await res.json()) as { result?: string; msg?: string; code?: string } & Record<
      string,
      unknown
    >;
    if (!res.ok || json.result !== "success") {
      const err = new Error(json.msg ?? `Zulip request failed: ${res.status}`) as Error & {
        code?: string;
      };
      err.code = json.code;
      throw err;
    }
    return json;
  }

  /**
   * The user's channels (subscribed + browsable) and the realm's channel
   * folders. Each channel carries its `folderId` when the realm exposes folder
   * membership (Zulip 11+); on older realms folderId stays null and `folders` is
   * empty, so callers degrade to a single flat list with no regression.
   */
  async fetchChannels(): Promise<{ channels: ZulipChannel[]; folders: ZulipChannelFolder[] }> {
    const subs = (await this.request("/users/me/subscriptions")) as {
      subscriptions: ZulipSubscription[];
    };
    const subscribed = new Set(subs.subscriptions.map((s) => s.stream_id));
    const channels: ZulipChannel[] = subs.subscriptions.map((s) => ({
      id: s.stream_id,
      name: s.name,
      display_name: s.description?.trim() ? s.description : s.name,
      subscribed: true,
      folderId: s.folder_id ?? null,
    }));
    // Also surface non-subscribed public channels the user can browse/join.
    try {
      const all = (await this.request("/streams")) as { streams: ZulipStream[] };
      for (const s of all.streams) {
        if (subscribed.has(s.stream_id)) continue;
        channels.push({
          id: s.stream_id,
          name: s.name,
          display_name: s.description?.trim() ? s.description : s.name,
          subscribed: false,
          folderId: s.folder_id ?? null,
        });
      }
    } catch {
      // /streams may be restricted; subscribed list alone is still useful.
    }
    const folders = await this.fetchChannelFolders();
    return { channels, folders };
  }

  /**
   * The realm's channel folders (Zulip 11+). Returns [] when the endpoint is
   * absent (older realm) or restricted, so the channel list degrades to flat.
   */
  async fetchChannelFolders(): Promise<ZulipChannelFolder[]> {
    try {
      const res = (await this.request("/channel_folders")) as {
        channel_folders: ZulipChannelFolderRaw[];
      };
      return (res.channel_folders ?? [])
        .filter((f) => !f.is_archived)
        .map((f) => ({ id: f.id, name: f.name, order: f.order }));
    } catch {
      return [];
    }
  }

  /** Topics in a channel, newest-first as Zulip returns them. */
  async fetchTopics(channelId: number): Promise<ZulipTopic[]> {
    const res = (await this.request(`/users/me/${channelId}/topics`)) as {
      topics: ZulipTopicRaw[];
    };
    return res.topics.map((t) => ({ name: t.name, maxId: t.max_id }));
  }

  /** History for a channel+topic, oldest-first for rendering. */
  async fetchHistory(channelId: number, topicName: string, numBefore = 50): Promise<ChatMessage[]> {
    const narrow = JSON.stringify([
      { operator: "stream", operand: channelId },
      { operator: "topic", operand: topicName },
    ]);
    const params = new URLSearchParams({
      anchor: "newest",
      num_before: String(numBefore),
      num_after: "0",
      narrow,
      apply_markdown: "true",
    });
    const res = (await this.request(`/messages?${params.toString()}`)) as {
      messages: ZulipRawMessage[];
    };
    return res.messages.map(toChatMessage);
  }

  /** Send a message to a channel+topic. Returns the new message id. */
  async sendMessage(channelId: number, topicName: string, body: string): Promise<{ id: number }> {
    const params = new URLSearchParams({
      type: "stream",
      to: String(channelId),
      topic: topicName,
      content: body,
    });
    const res = (await this.request("/messages", { method: "POST", body: params })) as {
      id: number;
    };
    return { id: res.id };
  }

  /**
   * Mark every message in a channel topic as read on Zulip (op=add flag=read over
   * the topic narrow). Grounding read-state in Zulip keeps unread_msgs in sync so
   * a re-register's snapshot no longer resurrects a thread the user already read.
   * Uses POST /messages/flags/narrow (narrow-scoped, server-paginated) so we don't
   * need the message ids client-side. Best-effort: failures are swallowed since
   * the local view-state gating remains the live source of truth.
   */
  async markTopicRead(channelId: number, topicName: string): Promise<void> {
    const narrow = [
      { operator: "stream", operand: channelId },
      { operator: "topic", operand: topicName },
    ];
    await this.markNarrowRead(narrow);
  }

  /** Mark a DM conversation (1:1 or group) read on Zulip via the dm narrow. */
  async markDmRead(otherIds: number[]): Promise<void> {
    const ids = otherIds.filter((id) => id !== this.selfUserId);
    const operand = ids.length > 0 ? ids : otherIds;
    await this.markNarrowRead([{ operator: "dm", operand }]);
  }

  private async markNarrowRead(narrow: Array<{ operator: string; operand: unknown }>): Promise<void> {
    try {
      const params = new URLSearchParams({
        anchor: "oldest",
        include_anchor: "true",
        num_before: "0",
        num_after: "5000",
        narrow: JSON.stringify(narrow),
        op: "add",
        flag: "read",
      });
      await this.request("/messages/flags/narrow", { method: "POST", body: params });
    } catch {
      // Best-effort: local gating still drives the live unread view.
    }
  }

  // ───── Direct messages + org members ─────

  /** All active, human org members (bots and deactivated users excluded). */
  async fetchAllUsers(): Promise<ZulipUser[]> {
    // client_gravatar=false forces Zulip to return resolvable avatar_url values
    // for Gravatar-backed users (otherwise avatar_url is null for the common
    // case of users who never uploaded a custom avatar).
    const res = (await this.request("/users?client_gravatar=false")) as {
      members: ZulipMember[];
    };
    return res.members
      .filter((m) => !m.is_bot && m.is_active)
      .map((m) => ({
        zulipUserId: m.user_id,
        atriumUserId: null, // presence.ts fills this in via email match
        name: m.full_name,
        email: m.email,
        imageUrl: m.avatar_url ?? undefined,
      }));
  }

  /** Custom Zulip user groups (system "role:*" groups excluded). */
  async fetchUserGroups(): Promise<ZulipUserGroup[]> {
    const res = (await this.request("/user_groups")) as {
      user_groups: Array<{
        id: number;
        name: string;
        description: string;
        members: number[];
        is_system_group?: boolean;
        // Zulip 12.x (feature level 506) marks retired groups deactivated.
        deactivated?: boolean;
      }>;
    };
    return res.user_groups
      .filter((g) => !g.is_system_group && !g.deactivated && !/^role:/i.test(g.name))
      .map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description ?? "",
        memberIds: g.members ?? [],
      }));
  }

  /**
   * Send a direct message to one (1:1) or more (group DM) recipients.
   * `recipientIds` may include this user's own id. Zulip ignores self UNLESS
   * self is the only recipient (a note-to-self), so we strip self when there are
   * other participants and only fall back to self when it's the sole recipient.
   */
  async sendDirectMessage(recipientIds: number[], body: string): Promise<{ id: number }> {
    const others = recipientIds.filter((id) => id !== this.selfUserId);
    const to = others.length > 0 ? others : recipientIds;
    const params = new URLSearchParams({
      type: "direct",
      to: JSON.stringify(to),
      content: body,
    });
    const res = (await this.request("/messages", { method: "POST", body: params })) as {
      id: number;
    };
    return { id: res.id };
  }

  /** History for a direct-message conversation, oldest-first for rendering. */
  async fetchDirectMessageHistory(
    recipientIds: number[],
    numBefore = 50,
  ): Promise<ChatMessage[]> {
    // "dm" is the current narrow operator; "pm-with" is deprecated.
    const narrow = JSON.stringify([{ operator: "dm", operand: recipientIds }]);
    const params = new URLSearchParams({
      anchor: "newest",
      num_before: String(numBefore),
      num_after: "0",
      narrow,
      apply_markdown: "true",
    });
    const res = (await this.request(`/messages?${params.toString()}`)) as {
      messages: ZulipRawMessage[];
    };
    return res.messages.map(toChatMessage);
  }

  /**
   * Fetch the user's recent DM conversations — both 1:1 and group DMs.
   *
   * Completeness matters here: grouping the last N DMs from a single
   * is:dm message window silently drops conversations whenever a few chatty
   * threads consume the whole window. So the COMPLETE conversation set comes
   * from Zulip's purpose-built `recent_private_conversations` (the /register
   * field "designed to support … the Direct messages widget"), which returns
   * every DM/group-DM as {user_ids (others, excluding self), max_message_id}
   * with no message-count cap.
   *
   * We then enrich the most-recent of those with a snippet/title/timestamp from
   * a single is:dm message window (one fetch, cheap), and fill titles for the
   * snippet-less remainder from the user directory. Window-backed rows sort
   * first by timestamp (newest); the snippet-less tail — necessarily older than
   * everything in the window — follows, ordered by max_message_id.
   */
  async fetchRecentDmConversations(numBefore = 200): Promise<ZulipDmConversation[]> {
    // Complete conversation set (no cap) + recent-message window for snippets,
    // fetched concurrently. usersById is only consulted for snippet-less rows.
    const [recent, windowMessages, users] = await Promise.all([
      this.fetchRecentPrivateConversations(),
      this.fetchDmMessageWindow(numBefore),
      this.fetchAllUsers(),
    ]);

    const usersById = new Map(users.map((u) => [u.zulipUserId, u.name]));

    // Group the window by participant-set key. Zulip returns messages
    // oldest-first within the window, so the LAST message seen for a key is the
    // most recent — track it so each conversation carries its newest message.
    const windowByKey = new Map<string, { ids: number[]; last: ZulipRawMessage }>();
    for (const m of windowMessages) {
      const dr = Array.isArray(m.display_recipient) ? m.display_recipient : [];
      const ids = [...new Set([this.selfUserId, m.sender_id, ...dr.map((u) => u.id)])];
      const key = participantKey(ids);
      const existing = windowByKey.get(key);
      if (!existing || m.timestamp >= existing.last.timestamp) {
        windowByKey.set(key, { ids, last: m });
      }
    }

    const windowBacked: ZulipDmConversation[] = [];
    const snippetless: ZulipDmConversation[] = [];

    for (const { user_ids, max_message_id } of recent) {
      // recent_private_conversations' user_ids excludes self; rebuild the full
      // participant set so the key matches the rest of the app.
      const ids = [...new Set([this.selfUserId, ...user_ids])];
      const key = participantKey(ids);
      const sortedIds = key.split(",").map(Number);
      const hit = windowByKey.get(key);
      if (hit) {
        windowBacked.push({
          conversationKey: key,
          participantIds: sortedIds,
          title: dmTitle(hit.last, this.selfUserId),
          lastMessage: toChatMessage(hit.last),
          lastMessageTs: new Date(hit.last.timestamp * 1000).toISOString(),
          lastMessageId: hit.last.id,
        });
      } else {
        const others = sortedIds.filter((id) => id !== this.selfUserId);
        const title =
          others.length === 0
            ? "You"
            : others.map((id) => usersById.get(id) ?? `User ${id}`).join(", ");
        snippetless.push({
          conversationKey: key,
          participantIds: sortedIds,
          title,
          lastMessageId: max_message_id,
        });
      }
    }

    windowBacked.sort(
      (a, b) =>
        new Date(b.lastMessageTs!).getTime() - new Date(a.lastMessageTs!).getTime(),
    );
    snippetless.sort((a, b) => b.lastMessageId - a.lastMessageId);
    return [...windowBacked, ...snippetless];
  }

  /**
   * Zulip's complete recent direct-message conversation set, via a throwaway
   * /register that only requests `recent_private_conversations`. Each entry is
   * {user_ids (the OTHER participants, excluding self), max_message_id}. No
   * message-count cap, so no conversation is silently dropped.
   */
  private async fetchRecentPrivateConversations(): Promise<
    Array<{ user_ids: number[]; max_message_id: number }>
  > {
    const body = new URLSearchParams({
      event_types: JSON.stringify(["recent_private_conversations"]),
      fetch_event_types: JSON.stringify(["recent_private_conversations"]),
    });
    const res = (await this.request("/register", { method: "POST", body })) as {
      queue_id?: string;
      recent_private_conversations?: Array<{ user_ids: number[]; max_message_id: number }>;
    };
    // The register call also opens an event queue; tear it down immediately so
    // it doesn't linger on the server.
    if (res.queue_id) {
      const del = new URLSearchParams({ queue_id: res.queue_id });
      void this.request(`/events?${del.toString()}`, { method: "DELETE" }).catch(() => {});
    }
    return res.recent_private_conversations ?? [];
  }

  /** The most-recent direct messages across all DM conversations (oldest-first). */
  private async fetchDmMessageWindow(numBefore: number): Promise<ZulipRawMessage[]> {
    const narrow = JSON.stringify([{ operator: "is", operand: "dm" }]);
    const params = new URLSearchParams({
      anchor: "newest",
      num_before: String(numBefore),
      num_after: "0",
      narrow,
      apply_markdown: "true",
    });
    const res = (await this.request(`/messages?${params.toString()}`)) as {
      messages: ZulipRawMessage[];
    };
    return res.messages;
  }

  // ───── Long-poll event loop ─────

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.register();
      this.emit("connected");
      void this.pollLoop();
    } catch (err) {
      this.running = false;
      this.emit("error", err instanceof Error ? err.message : "Zulip register failed");
    }
  }

  stop(): void {
    this.running = false;
    this.abort?.abort();
    this.abort = null;
    if (this.queueId) {
      const params = new URLSearchParams({ queue_id: this.queueId });
      // Best-effort queue cleanup; ignore failures.
      void this.request(`/events?${params.toString()}`, { method: "DELETE" }).catch(() => {});
      this.queueId = null;
    }
  }

  private async register(): Promise<void> {
    const body = new URLSearchParams({
      event_types: JSON.stringify(EVENT_TYPES),
      // Deliver live message events as server-rendered HTML, not raw markdown, so
      // a sent image/quote-reply renders on the echo without a reload (the
      // history fetches already pass apply_markdown=true).
      apply_markdown: "true",
      // Also pull the current unread state so the client can seed trustworthy
      // unread counts that survive reload + converge across devices.
      fetch_event_types: JSON.stringify(["unread_msgs"]),
    });
    const res = (await this.request("/register", { method: "POST", body })) as {
      queue_id: string;
      last_event_id: number;
      unread_msgs?: ZulipUnreadMsgs;
    };
    this.queueId = res.queue_id;
    this.lastEventId = res.last_event_id;
    if (res.unread_msgs) {
      this.emit("unread-snapshot", this.normalizeUnread(res.unread_msgs));
    }
  }

  /**
   * Normalize Zulip's `unread_msgs` into the app's unread keys:
   *  - channel topics -> `${stream_id}:${topic}` (any unread message ⇒ unread)
   *  - 1:1 DMs        -> participantKey([self, other])
   *  - group DMs      -> participantKey(user_ids_string members, incl. self)
   */
  private normalizeUnread(u: ZulipUnreadMsgs): { topics: string[]; dms: string[] } {
    const topics: string[] = [];
    for (const s of u.streams ?? []) {
      if (s.unread_message_ids.length > 0) topics.push(`${s.stream_id}:${s.topic}`);
    }
    const dms = new Set<string>();
    for (const pm of u.pms ?? []) {
      if (pm.unread_message_ids.length === 0) continue;
      const other = pm.other_user_id ?? pm.sender_id;
      if (other == null) continue;
      dms.add(participantKey([this.selfUserId, other]));
    }
    for (const h of u.huddles ?? []) {
      if (h.unread_message_ids.length === 0) continue;
      const ids = h.user_ids_string
        .split(",")
        .map((x) => Number(x))
        .filter((n) => !Number.isNaN(n));
      dms.add(participantKey([this.selfUserId, ...ids]));
    }
    return { topics, dms: [...dms] };
  }

  private async pollLoop(): Promise<void> {
    let backoff = 1000;
    while (this.running) {
      if (!this.queueId) {
        try {
          await this.register();
          backoff = 1000;
        } catch {
          await this.sleep(backoff);
          backoff = Math.min(backoff * 2, 30000);
          continue;
        }
      }
      this.abort = new AbortController();
      try {
        const params = new URLSearchParams({
          queue_id: this.queueId!,
          last_event_id: String(this.lastEventId),
        });
        const res = (await this.request(`/events?${params.toString()}`, {
          signal: this.abort.signal,
        })) as { events: ZulipEvent[] };
        backoff = 1000;
        for (const ev of res.events) {
          this.lastEventId = Math.max(this.lastEventId, ev.id);
          this.dispatch(ev);
        }
      } catch (err) {
        if (!this.running) break;
        const code = (err as { code?: string }).code;
        if (code === "BAD_EVENT_QUEUE_ID") {
          // Queue expired — drop it and re-register on the next iteration.
          this.queueId = null;
          continue;
        }
        await this.sleep(backoff);
        backoff = Math.min(backoff * 2, 30000);
      }
    }
    this.emit("disconnected");
  }

  private dispatch(ev: ZulipEvent): void {
    if (ev.type === "message" && ev.message && ev.message.type === "stream") {
      const m = ev.message;
      if (typeof m.stream_id !== "number") return;
      this.emit("message", {
        channelId: m.stream_id,
        topicName: m.subject ?? "",
        message: toChatMessage(m),
      });
    } else if (ev.type === "message" && ev.message && ev.message.type === "private") {
      const m = ev.message;
      // display_recipient is the canonical participant list (array of user
      // objects). Union with sender + self so the key is the full conversation
      // set regardless of which side sent the message.
      const dr = Array.isArray(m.display_recipient) ? m.display_recipient : [];
      const ids = [this.selfUserId, m.sender_id, ...dr.map((u) => u.id)];
      const key = participantKey(ids);
      this.emit("dm", {
        participantKey: key,
        participantIds: key.split(",").map(Number),
        title: dmTitle(m, this.selfUserId),
        message: toChatMessage(m),
      });
    } else if (
      ev.type === "update_message_flags" &&
      ev.flag === "read" &&
      ev.op === "add"
    ) {
      // A "read" flag was added (possibly on another device). Resolving the
      // affected message ids back to topic/dm keys would need a per-id lookup we
      // don't keep, so this is best-effort: the next register's unread_msgs
      // snapshot is authoritative, and the local view-state gating (client side)
      // remains the live source of truth. Emitting an empty read-flags keeps the
      // event wired for future per-narrow resolution without misclassifying it.
      this.emit("read-flags", {});
    } else if (ev.type === "reaction" && typeof ev.message_id === "number") {
      // Reaction events don't carry the stream/topic; the client resolves them
      // by message id within already-loaded topics. We forward channelId/topic
      // as 0/"" placeholders since the message id is the join key client-side.
      this.emit("reaction", {
        channelId: 0,
        topicName: "",
        messageId: ev.message_id,
        emojiName: ev.emoji_name ?? "",
        userId: ev.user_id ?? 0,
        op: ev.op === "remove" ? "remove" : "add",
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
