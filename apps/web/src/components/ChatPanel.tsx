import { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import type { ChatMessage, User } from "@atrium/shared";
import { useStore } from "../store";
import { UserSearchDialog } from "./UserSearchDialog";
import { MessageList, Composer } from "./zulip/chatPrimitives";

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
  const zulipLinked = useStore((s) => s.zulipLinked);
  const zulipSelfId = useStore((s) => s.zulipSelfId);
  const globalZulipChannelId = useStore((s) => s.globalZulipChannelId);
  const globalZulipTopicName = useStore((s) => s.globalZulipTopicName);
  const globalMessages = useStore((s) => s.globalMessages);
  const dmByUser = useStore((s) => s.dmByUser);
  const setDmMessages = useStore((s) => s.setDmMessages);
  const appendDmMessage = useStore((s) => s.appendDmMessage);

  const onClose = () => setChatOpen(false);
  const setActiveDmUser = (u: User | null) => {
    if (u) openDmWith(u);
    else closeDm();
  };

  // The drawer only hosts the Global and DMs tabs now; the Zulip surface lives
  // on the full-page /zulip route. Coerce any stale zulip view back to a tab
  // the drawer can render.
  const drawerTab: "global" | "dm" = tab === "dm" || tab === "zulip-dm" ? "dm" : "global";

  const fetchConversations = () => {
    fetch("/api/chat/dm/conversations", { credentials: "include" })
      .then((r) => r.json())
      .then((rows: Conversation[]) => setConversations(rows))
      .catch(console.error);
  };

  useEffect(() => {
    if (open && drawerTab === "dm") fetchConversations();
  }, [open, drawerTab, dmByUser]);

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
    drawerTab === "global" ? globalMessages : activeDmUser ? dmByUser[activeDmUser.id] ?? [] : [];

  // When Global is mapped to a Zulip channel+topic and the user is linked,
  // global messages carry Zulip sender ids (`zulip:<id>`), so own-vs-other
  // styling must key on the Zulip self id rather than the Atrium user id.
  // Internal DMs (and the unmapped/unlinked global) still use the Atrium id.
  const globalIsZulip =
    zulipLinked && globalZulipChannelId != null && globalZulipTopicName != null;
  const listMeId =
    drawerTab === "global" && globalIsZulip && zulipSelfId != null
      ? `zulip:${zulipSelfId}`
      : me?.id ?? "";

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
        value={drawerTab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
      >
        <Tab value="global" label="Global" />
        <Tab value="dm" label="DMs" />
      </Tabs>

      {drawerTab === "dm" && !activeDmUser ? (
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
          {drawerTab === "dm" && activeDmUser && (
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
          <MessageList messages={messages} meId={listMeId} />
          <Composer
            disabled={drawerTab === "dm" && !activeDmUser}
            onSend={drawerTab === "global" ? sendGlobal : sendDm}
          />
        </>
      )}
    </Drawer>
  );
}
