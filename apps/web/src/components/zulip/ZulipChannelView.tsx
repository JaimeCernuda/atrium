import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  Stack,
  Typography,
} from "@mui/material";
import TagIcon from "@mui/icons-material/Tag";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { ZulipChannel } from "@atrium/shared";
import { unreadByChannel, unreadByFolder, useStore } from "../../store";
import { getSocket } from "../../socket";
import { UnlinkedZulipFallback } from "../UnlinkedZulipFallback";
import {
  MessageList,
  Composer,
  openZulip,
  buildQuoteReply,
  channelNarrowUrl,
  type ComposerHandle,
} from "./chatPrimitives";

/**
 * Topic-first Zulip channel browser: a channel list that drills into its topics
 * and then into a topic's message stream + composer. Reads/writes the shared
 * store (active channel/topic) and emits the existing zulip:* socket events, so
 * it behaves identically whether mounted in the drawer or the full-page client.
 */
export function ZulipChannelView({ meId }: { meId: string }) {
  const linked = useStore((s) => s.zulipLinked);
  const connected = useStore((s) => s.zulipConnected);
  const error = useStore((s) => s.zulipError);
  const channels = useStore((s) => s.zulipChannels);
  const folders = useStore((s) => s.zulipFolders);
  const topicsByChannel = useStore((s) => s.zulipTopicsByChannel);
  const activeChannel = useStore((s) => s.zulipActiveChannel);
  const activeTopic = useStore((s) => s.zulipActiveTopic);
  const messagesByTopic = useStore((s) => s.zulipMessagesByTopic);
  const setActiveChannel = useStore((s) => s.setZulipActiveChannel);
  const setActiveTopic = useStore((s) => s.setZulipActiveTopic);
  const setTopics = useStore((s) => s.setZulipTopics);
  const setMessages = useStore((s) => s.setZulipMessages);
  const unreadTopics = useStore((s) => s.zulipUnreadTopics);
  const removeZulipUnreadTopic = useStore((s) => s.removeZulipUnreadTopic);
  const setZulipViewState = useStore((s) => s.setZulipViewState);

  const composerRef = useRef<ComposerHandle>(null);

  // Hierarchical unread counts (folder -> channel -> topic), derived from the
  // single boolean unread map so they can never drift.
  const byChannel = useMemo(() => unreadByChannel(unreadTopics), [unreadTopics]);
  const byFolder = useMemo(
    () => unreadByFolder(unreadTopics, channels, folders),
    [unreadTopics, channels, folders],
  );

  // If we arrive with an active channel (e.g. a room's "Open in Zulip" button)
  // but the channel list hasn't loaded yet, request it so the active channel's
  // name resolves and the topic view renders for the right channel.
  useEffect(() => {
    if (channels.length > 0) return;
    if (!connected) return;
    getSocket().emit("zulip:fetch-channels");
  }, [channels.length, connected]);

  // Topic-first: as soon as a channel is open, load ALL its topics (once).
  // Also fixes the room-bound auto-focus path, which sets activeChannel without
  // a topic — entering the room now surfaces the channel's topics immediately.
  useEffect(() => {
    if (activeChannel == null) return;
    if (topicsByChannel[activeChannel]) return;
    getSocket().emit("zulip:fetch-topics", activeChannel, (err, topics) => {
      if (!err && topics) setTopics(activeChannel, topics);
    });
  }, [activeChannel, topicsByChannel, setTopics]);

  // When a channel+topic is active, load its history once.
  useEffect(() => {
    if (activeChannel == null || activeTopic == null) return;
    const key = `${activeChannel}:${activeTopic}`;
    if (messagesByTopic[key]) return;
    getSocket().emit(
      "zulip:fetch-history",
      { channelId: activeChannel, topicName: activeTopic },
      (err, msgs) => {
        if (!err && msgs) setMessages(activeChannel, activeTopic, msgs);
      },
    );
  }, [activeChannel, activeTopic, messagesByTopic, setMessages]);

  const tabFocused = useStore((s) => s.zulipViewState.tabFocused);

  // Opening a topic marks it the active channel thread (so live messages to it
  // count as read while it's visible+focused) and clears its existing unread.
  // Closing back to the topic/channel list clears the active thread.
  useEffect(() => {
    if (activeChannel != null && activeTopic != null) {
      const key = `${activeChannel}:${activeTopic}`;
      setZulipViewState({ activeThread: "channel", activeThreadKey: key });
      removeZulipUnreadTopic(key);
    } else {
      setZulipViewState({ activeThread: null, activeThreadKey: null });
    }
  }, [activeChannel, activeTopic, removeZulipUnreadTopic, setZulipViewState]);

  // Ground read-state in Zulip: when a topic is genuinely viewed (open AND the
  // tab is focused), tell the server to mark it read on Zulip. This keeps
  // unread_msgs in sync so a re-register snapshot won't resurrect it as unread.
  // Re-runs on focus regain so a topic left open while the tab was blurred is
  // marked read once the user returns to it.
  useEffect(() => {
    if (activeChannel == null || activeTopic == null || !tabFocused) return;
    getSocket().emit("zulip:mark-read", {
      kind: "topic",
      channelId: activeChannel,
      topicName: activeTopic,
    });
  }, [activeChannel, activeTopic, tabFocused]);

  // Group channels by Zulip channel folder. Folders keep Zulip's `order`; an
  // "Other" bucket collects channels with no folder. Empty groups are dropped so
  // realms without folders (or sparsely-foldered ones) render cleanly. When no
  // folders exist at all this collapses to a single ungrouped list — no
  // regression from the old flat view.
  const OTHER_KEY = -1;
  const groups = useMemo(() => {
    const byFolder = new Map<number, ZulipChannel[]>();
    // Channels whose folderId is null OR points at a folder we don't know about
    // (archived, permission-hidden, or otherwise omitted by /channel_folders)
    // must still surface under "Other" rather than vanishing into an orphan
    // bucket that no section renders.
    const knownIds = new Set(folders.map((f) => f.id));
    for (const c of channels) {
      const key =
        c.folderId != null && knownIds.has(c.folderId) ? c.folderId : OTHER_KEY;
      (byFolder.get(key) ?? byFolder.set(key, []).get(key)!).push(c);
    }
    const ordered = [...folders]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter((f) => byFolder.has(f.id))
      .map((f) => ({ id: f.id, name: f.name, channels: byFolder.get(f.id)! }));
    const other = byFolder.get(OTHER_KEY);
    // Only label the leftover bucket "Other" when there's at least one real
    // folder section to distinguish it from; otherwise it's the whole list.
    if (other && other.length > 0) {
      ordered.push({
        id: OTHER_KEY,
        name: ordered.length > 0 ? "Other" : "Channels",
        channels: other,
      });
    }
    return ordered;
  }, [channels, folders]);

  // Collapsed-section state, keyed by folder id. Sections default to expanded;
  // a folder appears here only once toggled shut.
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const toggleFolder = (id: number) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!linked) {
    return (
      <UnlinkedZulipFallback
        onConnect={() => useStore.getState().setZulipLinkDialogOpen(true)}
        onOpenZulip={openZulip}
      />
    );
  }

  const send = (body: string) => {
    if (activeChannel == null || activeTopic == null) return;
    getSocket().emit("zulip:send", { channelId: activeChannel, topicName: activeTopic, body });
  };

  // Quote-reply: drop Zulip quote-and-reply markup into the composer, focused.
  const onReply = (target: {
    senderName: string;
    senderUserId: number;
    bodyHtml: string;
  }) => {
    if (activeChannel == null || activeTopic == null) return;
    const markup = buildQuoteReply({
      senderName: target.senderName,
      senderUserId: target.senderUserId,
      narrowUrl: channelNarrowUrl(activeChannel, activeTopic),
      originalHtml: target.bodyHtml,
    });
    composerRef.current?.insertAtCaret(markup);
  };

  const activeKey =
    activeChannel != null && activeTopic != null ? `${activeChannel}:${activeTopic}` : null;
  const messages = activeKey ? messagesByTopic[activeKey] ?? [] : [];

  // A topic is open: show its message stream + composer.
  if (activeChannel != null && activeTopic != null) {
    const channel = channels.find((c) => c.id === activeChannel);
    return (
      <Box sx={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          sx={{ p: 1, borderBottom: 1, borderColor: "divider", minWidth: 0, flexShrink: 0 }}
        >
          <IconButton
            size="small"
            onClick={() => setActiveChannel(activeChannel, null)}
            aria-label="Back to topics"
            sx={{ flexShrink: 0 }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <TagIcon fontSize="small" sx={{ mx: 0.5, color: "text.secondary", flexShrink: 0 }} />
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
            {channel?.name ?? activeChannel}
          </Typography>
          <Chip
            label={activeTopic}
            size="small"
            sx={{ ml: 1, maxWidth: "50%", flexShrink: 1 }}
          />
        </Stack>
        <MessageList messages={messages} meId={meId} onReply={onReply} />
        <Composer ref={composerRef} disabled={!connected} onSend={send} />
      </Box>
    );
  }

  // A channel is open (no topic yet): show ALL its topics prominently.
  if (activeChannel != null) {
    const channel = channels.find((c) => c.id === activeChannel);
    const topics = topicsByChannel[activeChannel];
    return (
      <>
        <Stack direction="row" alignItems="center" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
          <IconButton size="small" onClick={() => setActiveChannel(null, null)}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <TagIcon fontSize="small" sx={{ mx: 0.5, color: "primary.main" }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {channel?.name ?? activeChannel}
          </Typography>
        </Stack>
        <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
          <Typography
            variant="overline"
            sx={{ px: 2, pt: 1.5, display: "block", color: "text.secondary" }}
          >
            Topics
          </Typography>
          {!topics ? (
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: "block" }}>
              Loading topics…
            </Typography>
          ) : topics.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: "block" }}>
              No topics yet.
            </Typography>
          ) : (
            <List dense disablePadding>
              {topics.map((t) => {
                const unread = Boolean(unreadTopics[`${activeChannel}:${t.name}`]);
                return (
                  <ListItemButton
                    key={t.name}
                    onClick={() => {
                      setActiveChannel(activeChannel, t.name);
                      setActiveTopic(t.name);
                    }}
                  >
                    <TagIcon fontSize="small" sx={{ mr: 1, color: "text.disabled", flexShrink: 0 }} />
                    <Typography variant="body2" noWrap sx={{ fontWeight: unread ? 700 : 400, minWidth: 0 }}>
                      {t.name}
                    </Typography>
                    {unread && (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          bgcolor: "secondary.main",
                          ml: 0.75,
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>
      </>
    );
  }

  // No channel selected: list channels. Picking one opens its topic list.
  return (
    <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
      {error && (
        <Box sx={{ px: 2, pt: 1.5 }}>
          <Typography variant="caption" color="error">
            {error}
          </Typography>
        </Box>
      )}
      {!connected && (
        <Box sx={{ px: 2, pt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Connecting to Zulip…
          </Typography>
        </Box>
      )}
      {channels.length === 0 ? (
        <Box sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary">
            No channels loaded yet.
          </Typography>
        </Box>
      ) : (
        groups.map((group) => {
          const isCollapsed = Boolean(collapsed[group.id]);
          return (
            <Box key={group.id}>
              <ListItemButton
                onClick={() => toggleFolder(group.id)}
                sx={{ py: 0.5 }}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? (
                  <ChevronRightIcon fontSize="small" sx={{ mr: 0.5, color: "text.secondary" }} />
                ) : (
                  <ExpandMoreIcon fontSize="small" sx={{ mr: 0.5, color: "text.secondary" }} />
                )}
                <Typography
                  variant="overline"
                  sx={{ color: "text.secondary", lineHeight: 1.6, minWidth: 0 }}
                  noWrap
                >
                  {group.name}
                </Typography>
                {byFolder[group.id] ? (
                  <Chip
                    label={byFolder[group.id]}
                    size="small"
                    color="secondary"
                    sx={{ ml: 0.75, height: 18, fontSize: "0.65rem" }}
                  />
                ) : null}
                <Box sx={{ flex: 1 }} />
                <Chip label={group.channels.length} size="small" sx={{ height: 18, fontSize: "0.65rem" }} />
              </ListItemButton>
              <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
                <List dense disablePadding>
                  {group.channels.map((c) => {
                    const channelUnread = byChannel[c.id] ?? 0;
                    return (
                      <ListItemButton
                        key={c.id}
                        onClick={() => setActiveChannel(c.id, null)}
                        sx={{ pl: 3 }}
                      >
                        <TagIcon
                          fontSize="small"
                          sx={{
                            mr: 1,
                            flexShrink: 0,
                            color: c.subscribed ? "primary.main" : "text.disabled",
                          }}
                        />
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ fontWeight: channelUnread > 0 ? 700 : c.subscribed ? 600 : 400, minWidth: 0 }}
                        >
                          {c.name}
                        </Typography>
                        {channelUnread > 0 && (
                          <Chip
                            label={channelUnread}
                            size="small"
                            color="secondary"
                            sx={{ ml: 0.75, height: 18, fontSize: "0.65rem", flexShrink: 0 }}
                          />
                        )}
                      </ListItemButton>
                    );
                  })}
                </List>
              </Collapse>
            </Box>
          );
        })
      )}
    </Box>
  );
}
