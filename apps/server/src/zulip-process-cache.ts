import type { ZulipTopic } from "@atrium/shared";
import { ZulipDataCache, type ChannelsData } from "./zulip-cache.js";

// How long an idle user's cache survives in the process before eviction. Long
// enough that closing + reopening the app (or a brief disconnect) serves cached
// channels/topics instantly, short enough that abandoned entries don't pile up.
const IDLE_TTL_MS = 30 * 60 * 1000; // 30m
const EVICTION_INTERVAL_MS = 5 * 60 * 1000; // sweep every 5m
const MAX_ENTRIES = 1000; // hard cap; LRU-evict the oldest beyond this

interface ProcessCacheEntry {
  cache: ZulipDataCache;
  lastUsedAt: number;
}

/**
 * Process-level Zulip channels/folders/topics cache, keyed by Atrium userId.
 *
 * The per-user ZulipDataCache used to be owned by a ZulipManager entry and was
 * destroyed when the user's last socket disconnected — so it was effectively
 * session-scoped, forcing a fresh refetch (and visible lag) on every reconnect.
 * This map outlives release()/last-socket-disconnect: a cache is created on first
 * use and only ever evicted by the idle sweep, the LRU cap, or an admin reload.
 * Reopening the app within the TTL serves cached channels/topics with no refetch.
 *
 * It holds NO @atrium/shared runtime values — only the ZulipDataCache class (a
 * local server module) and type-only @atrium/shared imports — so the runtime
 * rule (no shared runtime values in apps/server) is preserved.
 */
export class ProcessLevelZulipCache {
  private readonly entries = new Map<string, ProcessCacheEntry>();
  private evictionTimer: NodeJS.Timeout | null = null;

  /**
   * Return the user's cache, creating it on first use. If it already exists its
   * fetch/fan-out callbacks are rebound to the CURRENT live client (the prior
   * client may have stopped) and `lastUsedAt` is refreshed. Idempotent.
   */
  getOrCreate(
    userId: string,
    fetchChannels: () => Promise<ChannelsData>,
    fetchTopics: (channelId: number) => Promise<ZulipTopic[]>,
    onChannels: (data: ChannelsData) => void,
  ): ZulipDataCache {
    const existing = this.entries.get(userId);
    if (existing) {
      existing.cache.rebind(fetchChannels, fetchTopics, onChannels);
      existing.lastUsedAt = Date.now();
      return existing.cache;
    }
    const cache = new ZulipDataCache(fetchChannels, fetchTopics, onChannels);
    this.entries.set(userId, { cache, lastUsedAt: Date.now() });
    this.enforceCap();
    return cache;
  }

  /** Bump a user's recency so an active user isn't idle-evicted. */
  markUsed(userId: string): void {
    const entry = this.entries.get(userId);
    if (entry) entry.lastUsedAt = Date.now();
  }

  /** Drop a user's cache (admin force-reload rebuilds it on next acquire). */
  evict(userId: string): void {
    this.entries.delete(userId);
  }

  /** Evict the least-recently-used entries until under the cap. */
  private enforceCap(): void {
    if (this.entries.size <= MAX_ENTRIES) return;
    const sorted = [...this.entries.entries()].sort(
      (a, b) => a[1].lastUsedAt - b[1].lastUsedAt,
    );
    let over = this.entries.size - MAX_ENTRIES;
    for (const [userId] of sorted) {
      if (over <= 0) break;
      this.entries.delete(userId);
      over -= 1;
    }
  }

  /** Sweep out entries idle past IDLE_TTL_MS, then enforce the LRU cap. */
  private sweep(): void {
    const cutoff = Date.now() - IDLE_TTL_MS;
    for (const [userId, entry] of this.entries) {
      if (entry.lastUsedAt < cutoff) this.entries.delete(userId);
    }
    this.enforceCap();
  }

  startEvictionLoop(): void {
    if (this.evictionTimer) return;
    this.evictionTimer = setInterval(() => this.sweep(), EVICTION_INTERVAL_MS);
    // Don't keep the process alive just for the sweep.
    this.evictionTimer.unref?.();
  }

  stopEvictionLoop(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
  }
}

/** Single process-wide instance shared by the ZulipManager. */
export const processLevelZulipCache = new ProcessLevelZulipCache();
