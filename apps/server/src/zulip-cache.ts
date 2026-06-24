import type { ZulipChannel, ZulipChannelFolder, ZulipTopic } from "@atrium/shared";

// Channels + folders change rarely; topics change a bit more often. Cache both
// per user so a reconnect (or a second tab) doesn't trigger a fresh Zulip
// refetch storm. Stale entries serve immediately and refresh in the background.
const CHANNELS_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const TOPICS_TTL_MS = 4 * 60 * 60 * 1000; // 4h

export interface ChannelsData {
  channels: ZulipChannel[];
  folders: ZulipChannelFolder[];
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

/**
 * Per-user TTL cache for a single Atrium user's Zulip channels/folders/topics.
 * Owned by a ZulipManager entry (one cache per linked user). Type-only imports
 * from @atrium/shared keep this runtime-safe for the compiled server.
 *
 * Read paths are stale-while-revalidate: a fresh entry returns immediately; a
 * stale entry returns the stale value AND kicks an async refetch whose result
 * is delivered out-of-band via the `onChannels` hook the caller supplies. An
 * empty entry awaits a single fetch. `forceReload` clears everything and
 * refetches now (the admin "reload" path).
 */
export class ZulipDataCache {
  private channels: CacheEntry<ChannelsData> | null = null;
  private topics = new Map<number, CacheEntry<ZulipTopic[]>>();
  // Guards so a stale-triggered background refetch isn't fired repeatedly while
  // one is already in flight.
  private channelsRefreshing = false;
  private topicsRefreshing = new Set<number>();

  /**
   * @param fetchChannels  fetches fresh channels+folders from Zulip
   * @param fetchTopics    fetches fresh topics for a channel from Zulip
   * @param onChannels     receives channels+folders after a background refresh
   *                       so the manager can fan them out to the user's sockets
   */
  constructor(
    private fetchChannels: () => Promise<ChannelsData>,
    private fetchTopics: (channelId: number) => Promise<ZulipTopic[]>,
    private onChannels: (data: ChannelsData) => void,
  ) {}

  /**
   * Re-point the cache's fetch/fan-out callbacks at a NEW live client. When the
   * cache survives a release()/reconnect (it lives in the process-level map), the
   * original closures captured a client that has since stopped. Rebinding swaps
   * the three callbacks while keeping all cached data, so cached channels/topics
   * serve instantly yet any background refresh runs through the current client.
   */
  rebind(
    fetchChannels: () => Promise<ChannelsData>,
    fetchTopics: (channelId: number) => Promise<ZulipTopic[]>,
    onChannels: (data: ChannelsData) => void,
  ): void {
    this.fetchChannels = fetchChannels;
    this.fetchTopics = fetchTopics;
    this.onChannels = onChannels;
  }

  async getChannels(): Promise<ChannelsData> {
    const now = Date.now();
    if (!this.channels) {
      const data = await this.fetchChannels();
      this.channels = { data, fetchedAt: now };
      return data;
    }
    if (now - this.channels.fetchedAt > CHANNELS_TTL_MS) {
      this.refreshChannels();
    }
    return this.channels.data;
  }

  async getTopics(channelId: number): Promise<ZulipTopic[]> {
    const now = Date.now();
    const entry = this.topics.get(channelId);
    if (!entry) {
      const data = await this.fetchTopics(channelId);
      this.topics.set(channelId, { data, fetchedAt: now });
      return data;
    }
    if (now - entry.fetchedAt > TOPICS_TTL_MS) {
      this.refreshTopics(channelId);
    }
    return entry.data;
  }

  /** Clear everything and refetch channels now; returns the fresh data. */
  async forceReload(): Promise<ChannelsData> {
    this.channels = null;
    this.topics.clear();
    const data = await this.fetchChannels();
    this.channels = { data, fetchedAt: Date.now() };
    return data;
  }

  private refreshChannels(): void {
    if (this.channelsRefreshing) return;
    this.channelsRefreshing = true;
    void this.fetchChannels()
      .then((data) => {
        this.channels = { data, fetchedAt: Date.now() };
        this.onChannels(data);
      })
      .catch(() => {
        // Keep the stale entry on failure; a later read retries.
      })
      .finally(() => {
        this.channelsRefreshing = false;
      });
  }

  private refreshTopics(channelId: number): void {
    if (this.topicsRefreshing.has(channelId)) return;
    this.topicsRefreshing.add(channelId);
    void this.fetchTopics(channelId)
      .then((data) => {
        this.topics.set(channelId, { data, fetchedAt: Date.now() });
      })
      .catch(() => {})
      .finally(() => {
        this.topicsRefreshing.delete(channelId);
      });
  }
}
