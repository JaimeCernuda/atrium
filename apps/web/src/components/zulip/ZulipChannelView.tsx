import { useEffect } from "react";
import {
  Box,
  Chip,
  IconButton,
  List,
  ListItemButton,
  Stack,
  Typography,
} from "@mui/material";
import TagIcon from "@mui/icons-material/Tag";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useStore } from "../../store";
import { getSocket } from "../../socket";
import { UnlinkedZulipFallback } from "../UnlinkedZulipFallback";
import { MessageList, Composer, openZulip } from "./chatPrimitives";

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
  const topicsByChannel = useStore((s) => s.zulipTopicsByChannel);
  const activeChannel = useStore((s) => s.zulipActiveChannel);
  const activeTopic = useStore((s) => s.zulipActiveTopic);
  const messagesByTopic = useStore((s) => s.zulipMessagesByTopic);
  const setActiveChannel = useStore((s) => s.setZulipActiveChannel);
  const setActiveTopic = useStore((s) => s.setZulipActiveTopic);
  const setTopics = useStore((s) => s.setZulipTopics);
  const setMessages = useStore((s) => s.setZulipMessages);

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

  const activeKey =
    activeChannel != null && activeTopic != null ? `${activeChannel}:${activeTopic}` : null;
  const messages = activeKey ? messagesByTopic[activeKey] ?? [] : [];

  // A topic is open: show its message stream + composer.
  if (activeChannel != null && activeTopic != null) {
    const channel = channels.find((c) => c.id === activeChannel);
    return (
      <>
        <Stack direction="row" alignItems="center" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
          <IconButton size="small" onClick={() => setActiveChannel(activeChannel, null)}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <TagIcon fontSize="small" sx={{ mx: 0.5, color: "text.secondary" }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {channel?.name ?? activeChannel}
          </Typography>
          <Chip label={activeTopic} size="small" sx={{ ml: 1 }} />
        </Stack>
        <MessageList messages={messages} meId={meId} />
        <Composer disabled={!connected} onSend={send} />
      </>
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
              {topics.map((t) => (
                <ListItemButton
                  key={t.name}
                  onClick={() => {
                    setActiveChannel(activeChannel, t.name);
                    setActiveTopic(t.name);
                  }}
                >
                  <TagIcon fontSize="small" sx={{ mr: 1, color: "text.disabled" }} />
                  <Typography variant="body2">{t.name}</Typography>
                </ListItemButton>
              ))}
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
        <List dense disablePadding>
          {channels.map((c) => (
            <ListItemButton key={c.id} onClick={() => setActiveChannel(c.id, null)}>
              <TagIcon
                fontSize="small"
                sx={{ mr: 1, color: c.subscribed ? "primary.main" : "text.disabled" }}
              />
              <Typography variant="body2" sx={{ fontWeight: c.subscribed ? 600 : 400 }}>
                {c.name}
              </Typography>
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
}
