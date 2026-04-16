import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Box,
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
import type { ChatMessage, User } from "@atrium/shared";
import { useStore } from "../store";

const DRAWER_WIDTH = 360;

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Conversation {
  user: User;
  lastMessageAt: string;
  lastMessagePreview: string;
}

export function ChatPanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<"global" | "dm">("global");
  const [activeDmUser, setActiveDmUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const me = useStore((s) => s.user);
  const globalMessages = useStore((s) => s.globalMessages);
  const dmByUser = useStore((s) => s.dmByUser);
  const setDmMessages = useStore((s) => s.setDmMessages);
  const appendDmMessage = useStore((s) => s.appendDmMessage);

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
      </Tabs>

      {tab === "dm" && !activeDmUser ? (
        <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
          <List dense>
            {conversations.length === 0 && (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No direct messages yet. Use the ping button on a user&apos;s avatar in a room, or
                  click their name below.
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
        </Box>
      ) : (
        <>
          {tab === "dm" && activeDmUser && (
            <Stack direction="row" alignItems="center" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
              <IconButton size="small" onClick={() => setActiveDmUser(null)}>
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
