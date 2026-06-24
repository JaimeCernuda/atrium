import type { Config } from "./config.js";
import { getZulipKey } from "./db.js";
import { decryptZulipKey } from "./zulip-crypto.js";
import { ZulipQueueClient } from "./zulip-client.js";

interface ManagedEntry {
  client: ZulipQueueClient;
  refCount: number;
}

/**
 * Fan-out hooks the presence layer wires up. Every callback is scoped to a
 * single Atrium userId so the caller can route emits to that user's sockets
 * only — Zulip data must never leak to other users.
 */
export interface ZulipFanout {
  onConnected: (userId: string) => void;
  onDisconnected: (userId: string) => void;
  onError: (userId: string, message: string) => void;
  onMessage: (
    userId: string,
    payload: { channelId: number; topicName: string; message: import("@atrium/shared").ChatMessage },
  ) => void;
  onReaction: (
    userId: string,
    payload: {
      channelId: number;
      topicName: string;
      messageId: number;
      emojiName: string;
      userId: number;
      op: "add" | "remove";
    },
  ) => void;
  onDm: (
    userId: string,
    payload: {
      participantKey: string;
      participantIds: number[];
      message: import("@atrium/shared").ChatMessage;
    },
  ) => void;
}

/**
 * Refcounted per-user Zulip event-queue lifecycle. A user's ZulipQueueClient is
 * started on their first socket connect and torn down when their last socket
 * disconnects. The decrypted API key lives only inside the client instance.
 */
export class ZulipManager {
  private readonly entries = new Map<string, ManagedEntry>();
  // Serializes concurrent acquire() calls per user so two rapid socket connects
  // can't create two clients for the same user.
  private readonly inflight = new Map<string, Promise<ZulipQueueClient | null>>();
  // Net live socket demand per user, tracked SYNCHRONOUSLY by acquire()/release()
  // so it stays correct across create()'s async gap. While a create() is in
  // flight the entry doesn't exist yet, so refcount changes are recorded here
  // instead; create() reads this as the client's starting refCount on resolve.
  // A connect+disconnect that races the gap nets to 0 and the queue is never
  // registered (no orphaned Zulip queue / long-poll). Cleared once create()
  // installs the entry (or decides not to).
  private readonly pendingDemand = new Map<string, number>();

  constructor(
    private readonly config: Config,
    private readonly fanout: ZulipFanout,
  ) {}

  get enabled(): boolean {
    return this.config.zulip !== null;
  }

  /**
   * Acquire (and start if needed) the client for a user. Returns the client if
   * the user is linked and Zulip is configured, otherwise null. Increments the
   * refcount; pair every successful acquire with a release().
   */
  async acquire(userId: string): Promise<ZulipQueueClient | null> {
    if (!this.enabled) return null;
    const existing = this.entries.get(userId);
    if (existing) {
      existing.refCount += 1;
      return existing.client;
    }
    const pending = this.inflight.get(userId);
    if (pending) {
      // Another connect is already creating the client. Record THIS caller's
      // demand synchronously (create() folds pendingDemand into the starting
      // refCount), then wait for the create() to finish. If this socket
      // disconnects before create() resolves, release() decrements the same
      // counter, so the in-flight create() sees the correct net demand.
      this.pendingDemand.set(userId, (this.pendingDemand.get(userId) ?? 0) + 1);
      return await pending;
    }

    // First connect for this user: seed demand at exactly 1 for this socket
    // (overwriting any stale leftover), then create. Subsequent connects that
    // race this create() add to this via the inflight branch above.
    this.pendingDemand.set(userId, 1);
    const promise = this.create(userId);
    this.inflight.set(userId, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(userId);
    }
  }

  private async create(userId: string): Promise<ZulipQueueClient | null> {
    const link = await getZulipKey(userId);
    if (!link) {
      this.pendingDemand.delete(userId);
      return null;
    }

    let apiKey: string;
    try {
      apiKey = decryptZulipKey(link.zulipApiKeyEnc);
    } catch {
      // Tampered or KEK rotated — treat as not linked; the user must re-link.
      this.pendingDemand.delete(userId);
      this.fanout.onError(userId, "Your stored Zulip key could not be read. Please reconnect Zulip.");
      return null;
    }

    // Net live socket demand accumulated while we awaited getZulipKey/decrypt.
    // Sockets that connected contributed +1 (acquire), sockets that disconnected
    // during the gap contributed -1 (release). If the net is <= 0 every socket
    // that wanted this client has already gone away, so don't register a Zulip
    // event queue / long-poll at all (that would orphan the queue forever).
    const refCount = this.pendingDemand.get(userId) ?? 0;
    this.pendingDemand.delete(userId);
    if (refCount <= 0) {
      return null;
    }

    const client = new ZulipQueueClient(link.zulipEmail, apiKey, link.zulipUserId ?? 0);
    client.on("connected", () => this.fanout.onConnected(userId));
    client.on("disconnected", () => this.fanout.onDisconnected(userId));
    client.on("error", (message) => this.fanout.onError(userId, message));
    client.on("message", (payload) => this.fanout.onMessage(userId, payload));
    client.on("reaction", (payload) => this.fanout.onReaction(userId, payload));
    client.on("dm", (payload) => this.fanout.onDm(userId, payload));

    const entry: ManagedEntry = { client, refCount };
    this.entries.set(userId, entry);
    void client.start();
    return client;
  }

  /** Current client for a user without changing the refcount. */
  get(userId: string): ZulipQueueClient | null {
    return this.entries.get(userId)?.client ?? null;
  }

  /** Decrement the refcount; stop + drop the client when it reaches zero. */
  release(userId: string): void {
    const entry = this.entries.get(userId);
    if (!entry) {
      // The client may still be in create()'s async gap (socket connected then
      // disconnected before start()). Record the release against pendingDemand
      // so create() nets it out and skips registering the queue. Only count it
      // while a create() is actually in flight; a stray release with no inflight
      // create and no entry has nothing to balance.
      if (this.inflight.has(userId)) {
        this.pendingDemand.set(userId, (this.pendingDemand.get(userId) ?? 0) - 1);
      }
      return;
    }
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      entry.client.stop();
      this.entries.delete(userId);
    }
  }
}
