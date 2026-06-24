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
      // Another connect is already creating the client. Wait for it, then bump
      // the refcount for THIS caller too.
      const client = await pending;
      if (client) {
        const entry = this.entries.get(userId);
        if (entry) entry.refCount += 1;
      }
      return client;
    }

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
    if (!link) return null;

    let apiKey: string;
    try {
      apiKey = decryptZulipKey(link.zulipApiKeyEnc);
    } catch {
      // Tampered or KEK rotated — treat as not linked; the user must re-link.
      this.fanout.onError(userId, "Your stored Zulip key could not be read. Please reconnect Zulip.");
      return null;
    }

    const client = new ZulipQueueClient(link.zulipEmail, apiKey);
    client.on("connected", () => this.fanout.onConnected(userId));
    client.on("disconnected", () => this.fanout.onDisconnected(userId));
    client.on("error", (message) => this.fanout.onError(userId, message));
    client.on("message", (payload) => this.fanout.onMessage(userId, payload));
    client.on("reaction", (payload) => this.fanout.onReaction(userId, payload));

    const entry: ManagedEntry = { client, refCount: 1 };
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
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      entry.client.stop();
      this.entries.delete(userId);
    }
  }
}
