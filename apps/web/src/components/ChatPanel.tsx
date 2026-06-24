import { useEffect, useRef, useState } from "react";
import {
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
import TagIcon from "@mui/icons-material/Tag";
import {
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { ChatMessage, User, ZulipUser } from "@atrium/shared";
import { participantKey } from "@atrium/shared";
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
  const setTabRaw = useStore((s) => s.setChatView);
  const zulipLinked = useStore((s) => s.zulipLinked);
  // When Zulip is linked, the "DMs" tab routes to the unified Zulip DM surface.
  const setTab = (v: "global" | "dm" | "zulip" | "zulip-dm") => {
    if (v === "dm" && zulipLinked) {
      setTabRaw("zulip-dm");
      return;
    }
    setTabRaw(v);
  };
  // Keep the DMs tab highlighted while in the zulip-dm view.
  const dmTabValue = tab === "zulip-dm" ? "dm" : tab;
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
      <Tabs
        value={dmTabValue}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
      >
        <Tab value="global" label="Global" />
        <Tab value="dm" label="DMs" />
        <Tab value="zulip" label="Zulip" />
      </Tabs>

      {tab === "zulip" ? (
        <ZulipChannelView meId={me?.id ?? ""} />
      ) : tab === "zulip-dm" ? (
        <ZulipDmView />
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
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Zulip is not connected yet. Open <strong>Settings</strong> and choose{" "}
          <strong>Connect Zulip</strong> to bring your channels into Atrium.
        </Typography>
      </Box>
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

function ZulipDmView() {
  const me = useStore((s) => s.user);
  const selfId = useStore((s) => s.zulipSelfId);
  const connected = useStore((s) => s.zulipConnected);
  const users = useStore((s) => s.zulipUsers);
  const dmsByParticipants = useStore((s) => s.zulipDmsByParticipants);
  const activeParticipants = useStore((s) => s.zulipActiveDmParticipants);
  const setActiveParticipants = useStore((s) => s.setZulipActiveDmParticipants);
  const setDmMessages = useStore((s) => s.setZulipDmMessages);
  const [composeOpen, setComposeOpen] = useState(false);

  const usersById = new Map(users.map((u) => [u.zulipUserId, u]));
  const activeKey = activeParticipants ? participantKey(activeParticipants) : null;

  // Load history for the active conversation once.
  useEffect(() => {
    if (!activeParticipants || activeKey == null) return;
    if (dmsByParticipants[activeKey]) return;
    getSocket().emit(
      "zulip:fetch-dm-history",
      { participantIds: activeParticipants },
      (err, msgs) => {
        if (!err && msgs) setDmMessages(activeKey, msgs);
      },
    );
  }, [activeParticipants, activeKey, dmsByParticipants, setDmMessages]);

  const send = (body: string) => {
    if (!activeParticipants) return;
    getSocket().emit("zulip:send-dm", { participantIds: activeParticipants, body });
  };

  // An active conversation: header + messages + composer.
  if (activeParticipants && activeKey != null) {
    const others = activeParticipants.filter((id) => id !== selfId);
    const title =
      others.map((id) => usersById.get(id)?.name ?? `User ${id}`).join(", ") || "Direct message";
    const messages = dmsByParticipants[activeKey] ?? [];
    return (
      <>
        <Stack direction="row" alignItems="center" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
          <IconButton size="small" onClick={() => setActiveParticipants(null)}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 600, ml: 0.5 }}>
            {title}
          </Typography>
        </Stack>
        <MessageList messages={messages} meId={me ? `zulip:${selfId}` : ""} />
        <Composer disabled={!connected} onSend={send} />
      </>
    );
  }

  // No conversation open: list people + a "New message" action for group DMs.
  return (
    <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
      <Box sx={{ p: 1.5 }}>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setComposeOpen(true)}
        >
          New message
        </Button>
      </Box>
      {users.length === 0 ? (
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No people loaded yet.
          </Typography>
        </Box>
      ) : (
        <List dense>
          {users
            .filter((u) => u.zulipUserId !== selfId)
            .map((u) => (
              <ListItemButton
                key={u.zulipUserId}
                onClick={() => setActiveParticipants(selfId != null ? [selfId, u.zulipUserId] : [u.zulipUserId])}
              >
                <Avatar src={u.imageUrl} sx={{ width: 32, height: 32, mr: 1 }}>
                  {u.name.charAt(0)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2">{u.name}</Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {u.email}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
        </List>
      )}
      <NewGroupDmDialog
        open={composeOpen}
        users={users.filter((u) => u.zulipUserId !== selfId)}
        onClose={() => setComposeOpen(false)}
        onStart={(ids) => {
          setComposeOpen(false);
          setActiveParticipants(selfId != null ? [selfId, ...ids] : ids);
        }}
      />
    </Box>
  );
}

function NewGroupDmDialog({
  open,
  users,
  onClose,
  onStart,
}: {
  open: boolean;
  users: ZulipUser[];
  onClose: () => void;
  onStart: (ids: number[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New message</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <List dense>
          {users.map((u) => (
            <ListItemButton key={u.zulipUserId} onClick={() => toggle(u.zulipUserId)}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Checkbox edge="start" checked={selected.includes(u.zulipUserId)} tabIndex={-1} disableRipple />
              </ListItemIcon>
              <Avatar src={u.imageUrl} sx={{ width: 28, height: 28, mr: 1 }}>
                {u.name.charAt(0)}
              </Avatar>
              <ListItemText primary={u.name} secondary={u.email} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={selected.length === 0} onClick={() => onStart(selected)}>
          Start chat
        </Button>
      </DialogActions>
    </Dialog>
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
