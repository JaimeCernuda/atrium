import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Avatar,
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TagIcon from "@mui/icons-material/Tag";
import type { ChatMessage, User } from "@atrium/shared";
import { useStore } from "../store";
import { getSocket } from "../socket";
import { UserSearchDialog } from "./UserSearchDialog";

const DRAWER_WIDTH = 360;

interface Conversation {
  user: User;
  lastMessageAt: string;
  lastMessagePreview: string;
}

export function ChatPanel() {
  const open = useStore((s) => s.chatOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const tab = useStore((s) => s.chatView);
  const setTab = useStore((s) => s.setChatView);
  const activeDmUser = useStore((s) => s.activeDmUser);
  const closeDm = useStore((s) => s.closeDm);
  const openDmWith = useStore((s) => s.openDmWith);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const me = useStore((s) => s.user);
  const globalMessages = useStore((s) => s.globalMessages);
  const dmByUser = useStore((s) => s.dmByUser);
  const setDmMessages = useStore((s) => s.setDmMessages);
  const appendDmMessage = useStore((s) => s.appendDmMessage);

  const onClose = () => setChatOpen(false);
  const setActiveDmUser = (u: User | null) => {
    if (u) openDmWith(u);
    else closeDm();
  };

  const fetchConversations = () => {
    fetch("/api/chat/dm/conversations", { credentials: "include" })
      .then((r) => r.json())
      .then((rows: Conversation[]) => setConversations(rows))
      .catch(console.error);
  };

  useEffect(() => {
    if (open && tab === "dm") fetchConversations();
  }, [open, tab, dmByUser]);

  useEffect(() => {
    if (!activeDmUser) return;
    if (dmByUser[activeDmUser.id]) return;
    fetch(`/api/chat/dm/${activeDmUser.id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((msgs: ChatMessage[]) => setDmMessages(activeDmUser.id, msgs))
      .catch(console.error);
  }, [activeDmUser, dmByUser, setDmMessages]);

  const sendGlobal = async (body: string) => {
    await fetch("/api/chat/global", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
  };

  const sendDm = async (body: string) => {
    if (!activeDmUser) return;
    const res = await fetch(`/api/chat/dm/${activeDmUser.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      const msg = (await res.json()) as ChatMessage;
      appendDmMessage(msg);
    }
  };

  const messages =
    tab === "global" ? globalMessages : activeDmUser ? dmByUser[activeDmUser.id] ?? [] : [];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="persistent"
      PaperProps={{ sx: { width: DRAWER_WIDTH } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1, pl: 2 }}>
        <Typography variant="h6">Chat</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
        <Tab value="global" label="Global" />
        <Tab value="dm" label="DMs" />
        <Tab value="zulip" label="Zulip" />
      </Tabs>

      {tab === "zulip" ? (
        <ZulipChannelView meId={me?.id ?? ""} />
      ) : tab === "dm" && !activeDmUser ? (
        <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
          <Box sx={{ p: 1.5 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setSearchOpen(true)}
            >
              New message
            </Button>
          </Box>
          <List dense>
            {conversations.length === 0 && (
              <Box sx={{ px: 2, pb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No direct messages yet. Click <strong>New message</strong> to start one,
                  or tap any user&apos;s avatar on a room card.
                </Typography>
              </Box>
            )}
            {conversations.map((c) => (
              <ListItemButton key={c.user.id} onClick={() => setActiveDmUser(c.user)}>
                <Avatar src={c.user.imageUrl} sx={{ width: 32, height: 32, mr: 1 }}>
                  {c.user.name.charAt(0)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2">{c.user.name}</Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {c.lastMessagePreview}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
          </List>
          <UserSearchDialog
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            onPick={(u) => {
              setSearchOpen(false);
              setActiveDmUser(u);
            }}
          />
        </Box>
      ) : (
        <>
          {tab === "dm" && activeDmUser && (
            <Stack direction="row" alignItems="center" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
              <IconButton size="small" onClick={closeDm}>
                <CloseIcon fontSize="small" />
              </IconButton>
              <Avatar src={activeDmUser.imageUrl} sx={{ width: 24, height: 24, mx: 1 }}>
                {activeDmUser.name.charAt(0)}
              </Avatar>
              <Typography variant="body2">{activeDmUser.name}</Typography>
            </Stack>
          )}
          <MessageList messages={messages} meId={me?.id ?? ""} />
          <Composer
            disabled={tab === "dm" && !activeDmUser}
            onSend={tab === "global" ? sendGlobal : sendDm}
          />
        </>
      )}
    </Drawer>
  );
}

function MessageList({ messages, meId }: { messages: ChatMessage[]; meId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <Box sx={{ flexGrow: 1, overflowY: "auto", p: 2 }}>
      <Stack spacing={1.2}>
        {messages.map((m) => (
          <Stack
            key={m.id}
            direction={m.sender.id === meId ? "row-reverse" : "row"}
            spacing={1}
            alignItems="flex-end"
          >
            <Tooltip title={m.sender.name}>
              <Avatar src={m.sender.imageUrl} sx={{ width: 28, height: 28 }}>
                {m.sender.name.charAt(0)}
              </Avatar>
            </Tooltip>
            <Box
              sx={{
                bgcolor: m.sender.id === meId ? "primary.main" : "action.hover",
                color: m.sender.id === meId ? "primary.contrastText" : "text.primary",
                px: 1.5,
                py: 0.75,
                borderRadius: 2,
                maxWidth: "75%",
                wordBreak: "break-word",
              }}
            >
              <Typography variant="body2">{m.body}</Typography>
            </Box>
          </Stack>
        ))}
        <div ref={bottomRef} />
      </Stack>
    </Box>
  );
}

function ZulipChannelView({ meId }: { meId: string }) {
  const linked = useStore((s) => s.zulipLinked);
  const connected = useStore((s) => s.zulipConnected);
  const error = useStore((s) => s.zulipError);
  const channels = useStore((s) => s.zulipChannels);
  const activeChannel = useStore((s) => s.zulipActiveChannel);
  const activeTopic = useStore((s) => s.zulipActiveTopic);
  const messagesByTopic = useStore((s) => s.zulipMessagesByTopic);
  const setActiveChannel = useStore((s) => s.setZulipActiveChannel);
  const setActiveTopic = useStore((s) => s.setZulipActiveTopic);
  const setTopics = useStore((s) => s.setZulipTopics);
  const setMessages = useStore((s) => s.setZulipMessages);

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
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Zulip is not connected yet. Open <strong>Settings</strong> and choose{" "}
          <strong>Connect Zulip</strong> to bring your channels into Atrium.
        </Typography>
      </Box>
    );
  }

  const loadTopics = (channelId: number) => {
    getSocket().emit("zulip:fetch-topics", channelId, (err, topics) => {
      if (!err && topics) setTopics(channelId, topics);
    });
  };

  const send = (body: string) => {
    if (activeChannel == null || activeTopic == null) return;
    getSocket().emit("zulip:send", { channelId: activeChannel, topicName: activeTopic, body });
  };

  const activeKey = activeChannel != null && activeTopic != null ? `${activeChannel}:${activeTopic}` : null;
  const messages = activeKey ? messagesByTopic[activeKey] ?? [] : [];

  // A topic is open: show its message stream + composer.
  if (activeChannel != null && activeTopic != null) {
    const channel = channels.find((c) => c.id === activeChannel);
    return (
      <>
        <Stack direction="row" alignItems="center" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
          <IconButton size="small" onClick={() => setActiveChannel(activeChannel, null)}>
            <CloseIcon fontSize="small" />
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

  // Channel/topic browser.
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
        channels.map((c) => (
          <ChannelAccordion
            key={c.id}
            channelId={c.id}
            name={c.name}
            subscribed={c.subscribed}
            onExpand={() => loadTopics(c.id)}
            onPickTopic={(topic) => {
              setActiveChannel(c.id, topic);
              setActiveTopic(topic);
            }}
          />
        ))
      )}
    </Box>
  );
}

function ChannelAccordion({
  channelId,
  name,
  subscribed,
  onExpand,
  onPickTopic,
}: {
  channelId: number;
  name: string;
  subscribed: boolean;
  onExpand: () => void;
  onPickTopic: (topic: string) => void;
}) {
  const topics = useStore((s) => s.zulipTopicsByChannel[channelId]);
  return (
    <Accordion
      disableGutters
      square
      elevation={0}
      onChange={(_, expanded) => {
        if (expanded && !topics) onExpand();
      }}
      sx={{ "&:before": { display: "none" }, borderBottom: 1, borderColor: "divider" }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <TagIcon fontSize="small" sx={{ mr: 1, color: subscribed ? "primary.main" : "text.disabled" }} />
        <Typography variant="body2" sx={{ fontWeight: subscribed ? 600 : 400 }}>
          {name}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
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
              <ListItemButton key={t.name} onClick={() => onPickTopic(t.name)} sx={{ pl: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  {t.name}
                </Typography>
              </ListItemButton>
            ))}
          </List>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function Composer({ disabled, onSend }: { disabled?: boolean; onSend: (body: string) => void }) {
  const [body, setBody] = useState("");
  const send = () => {
    const trimmed = body.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setBody("");
  };
  return (
    <Stack direction="row" spacing={1} sx={{ p: 1, borderTop: 1, borderColor: "divider" }}>
      <TextField
        size="small"
        fullWidth
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={disabled ? "Pick a conversation…" : "Type a message…"}
        disabled={disabled}
        multiline
        maxRows={4}
      />
      <IconButton color="primary" onClick={send} disabled={disabled}>
        <SendIcon />
      </IconButton>
    </Stack>
  );
}
