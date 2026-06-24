import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import GroupIcon from "@mui/icons-material/Group";
import type { ChatMessage, ZulipUser, ZulipUserGroup } from "@atrium/shared";
import { participantKey } from "@atrium/shared";
import { useStore } from "../../store";
import { getSocket } from "../../socket";
import { firstName, firstNames } from "../../names";
import { UnlinkedZulipFallback } from "../UnlinkedZulipFallback";
import {
  MessageList,
  Composer,
  openZulip,
  buildQuoteReply,
  dmNarrowUrl,
  type ComposerHandle,
} from "./chatPrimitives";

type DmTier = "featured" | "secondary" | "others";

interface DmBucket {
  id: string; // group id as string, or "others"
  name: string;
  tier: DmTier;
  users: ZulipUser[];
}

/**
 * Partition people into collapsible sections by Zulip user group, honoring the
 * admin policy. A person appears once, under their highest-priority group
 * (featured > secondary). People in no listed group land in "Others". When the
 * policy or groups are missing, returns a single flat "People" bucket.
 */
function buildBuckets(
  users: ZulipUser[],
  groups: ZulipUserGroup[],
  policy: { featured: number[]; secondary: number[] } | null,
  selfId: number | null,
): DmBucket[] {
  const people = users.filter((u) => u.zulipUserId !== selfId);
  if (!policy || groups.length === 0) {
    return [{ id: "others", name: "People", tier: "others", users: people }];
  }
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  // Ordered list of (tier, groupId) by priority: featured first, then secondary.
  const ordered: Array<{ tier: DmTier; group: ZulipUserGroup }> = [];
  for (const gid of policy.featured) {
    const g = groupsById.get(gid);
    if (g) ordered.push({ tier: "featured", group: g });
  }
  for (const gid of policy.secondary) {
    if (policy.featured.includes(gid)) continue;
    const g = groupsById.get(gid);
    if (g) ordered.push({ tier: "secondary", group: g });
  }

  const assigned = new Set<number>();
  const buckets: DmBucket[] = ordered.map(({ tier, group }) => {
    const members: ZulipUser[] = [];
    for (const u of people) {
      if (assigned.has(u.zulipUserId)) continue;
      if (group.memberIds.includes(u.zulipUserId)) {
        members.push(u);
        assigned.add(u.zulipUserId);
      }
    }
    return { id: String(group.id), name: group.name, tier, users: members };
  });

  const others = people.filter((u) => !assigned.has(u.zulipUserId));
  if (others.length > 0) {
    buckets.push({ id: "others", name: "Others", tier: "others", users: others });
  }
  return buckets.filter((b) => b.users.length > 0);
}

/** Filter every bucket's people by a free-text query (name or email). */
function filterBucketsBySearch(buckets: DmBucket[], query: string): DmBucket[] {
  const q = query.trim().toLowerCase();
  if (!q) return buckets;
  return buckets
    .map((b) => ({
      ...b,
      users: b.users.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      ),
    }))
    .filter((b) => b.users.length > 0);
}

// Plain-text preview of a (possibly HTML) message body for a conversation row.
function snippet(body: string): string {
  let text = body;
  if (body.indexOf("<") !== -1 && typeof document !== "undefined") {
    const div = document.createElement("div");
    div.innerHTML = body;
    text = div.textContent ?? "";
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

// Relative time for a conversation row: "now", "5m", "3h", "Yesterday", or a date.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Unified Zulip DM surface. The default (no open conversation) view is the
 * reader's recent DM list — 1:1 and group, most-recent-first — with search and
 * a "New message" action. Selecting a row opens that conversation's full
 * history + composer. The group-organized people picker lives in the New
 * message dialog. Shared store + zulip:* socket events keep it identical across
 * the drawer and the full-page client.
 */
export function ZulipDmView() {
  const me = useStore((s) => s.user);
  const selfId = useStore((s) => s.zulipSelfId);
  const connected = useStore((s) => s.zulipConnected);
  const linked = useStore((s) => s.zulipLinked);
  const users = useStore((s) => s.zulipUsers);
  const groups = useStore((s) => s.zulipUserGroups);
  const policy = useStore((s) => s.zulipUserGroupPolicy);
  const dmsByParticipants = useStore((s) => s.zulipDmsByParticipants);
  const activeParticipants = useStore((s) => s.zulipActiveDmParticipants);
  const setActiveParticipants = useStore((s) => s.setZulipActiveDmParticipants);
  const setDmMessages = useStore((s) => s.setZulipDmMessages);
  const appendDmMessage = useStore((s) => s.appendZulipDmMessage);
  const reconcileDmMessageId = useStore((s) => s.reconcileZulipDmMessageId);
  const unreadDms = useStore((s) => s.zulipUnreadDms);
  const removeZulipUnreadDm = useStore((s) => s.removeZulipUnreadDm);
  const setZulipViewState = useStore((s) => s.setZulipViewState);
  const conversations = useStore((s) => s.zulipDmConversations);
  const setConversations = useStore((s) => s.setZulipDmConversations);
  const composerRef = useRef<ComposerHandle>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");

  const usersById = useMemo(() => new Map(users.map((u) => [u.zulipUserId, u])), [users]);
  const activeKey = activeParticipants ? participantKey(activeParticipants) : null;

  // Pull the recent-DM list once linked + connected, and refresh on reconnect.
  useEffect(() => {
    if (!linked || !connected) return;
    getSocket().emit("zulip:fetch-dm-conversations", (err, convos) => {
      if (!err && convos) setConversations(convos);
    });
  }, [linked, connected, setConversations]);

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

  // Opening a conversation marks it the active DM thread (so live messages to it
  // count as read while the drawer's open + tab focused) and clears its unread.
  // Closing back to the list clears the active thread.
  useEffect(() => {
    if (activeKey != null) {
      setZulipViewState({ activeThread: "dm", activeThreadKey: activeKey });
      removeZulipUnreadDm(activeKey);
    } else {
      setZulipViewState({ activeThread: null, activeThreadKey: null });
    }
    setSendError(null);
  }, [activeKey, removeZulipUnreadDm, setZulipViewState]);

  const tabFocused = useStore((s) => s.zulipViewState.tabFocused);

  // Ground read-state in Zulip: when a DM conversation is genuinely viewed (open
  // AND the tab focused), tell the server to mark it read on Zulip so a
  // re-register snapshot won't resurrect it as unread. Re-runs on focus regain.
  useEffect(() => {
    if (!activeParticipants || activeKey == null || !tabFocused) return;
    getSocket().emit("zulip:mark-read", {
      kind: "dm",
      participantIds: activeParticipants,
    });
  }, [activeParticipants, activeKey, tabFocused]);

  const send = (body: string) => {
    if (!activeParticipants || activeKey == null) return;
    setSendError(null);
    // Optimistically show the message immediately under a temporary id. When the
    // server callback returns the real Zulip message id we rewrite the temp id to
    // it, so the later zulip:dm echo dedupes against this same entry (by id) and
    // we never render a double.
    const tempId = `pending:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const optimistic: ChatMessage = {
      id: tempId,
      body,
      createdAt: new Date().toISOString(),
      recipientId: null,
      sender: {
        id: selfId != null ? `zulip:${selfId}` : "",
        name: me?.name ?? "You",
        email: me?.email ?? "",
        imageUrl: me?.imageUrl,
      },
    };
    appendDmMessage(activeKey, optimistic);
    getSocket().emit(
      "zulip:send-dm",
      { participantIds: activeParticipants, body },
      (err, result) => {
        if (err) {
          setSendError(err);
          return;
        }
        if (result?.id != null) {
          reconcileDmMessageId(activeKey, tempId, String(result.id));
        }
      },
    );
  };

  // Quote-reply in a DM: build the DM narrow + quote markup and insert it.
  const onReply = (target: {
    senderName: string;
    senderUserId: number;
    bodyHtml: string;
  }) => {
    if (!activeParticipants) return;
    const others = activeParticipants.filter((id) => id !== selfId);
    const markup = buildQuoteReply({
      senderName: target.senderName,
      senderUserId: target.senderUserId,
      narrowUrl: dmNarrowUrl(others),
      originalHtml: target.bodyHtml,
    });
    composerRef.current?.insertAtCaret(markup);
  };

  if (!linked) {
    return (
      <UnlinkedZulipFallback
        onConnect={() => useStore.getState().setZulipLinkDialogOpen(true)}
        onOpenZulip={openZulip}
      />
    );
  }

  // An active conversation: header + messages + composer.
  if (activeParticipants && activeKey != null) {
    const others = activeParticipants.filter((id) => id !== selfId);
    const title =
      firstNames(others.map((id) => usersById.get(id)?.name ?? `User ${id}`)) || "Direct message";
    const messages = dmsByParticipants[activeKey] ?? [];
    return (
      <Box sx={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          sx={{ p: 1, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}
        >
          <IconButton size="small" onClick={() => setActiveParticipants(null)}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 600, ml: 0.5 }}>
            {title}
          </Typography>
        </Stack>
        <MessageList messages={messages} meId={me ? `zulip:${selfId}` : ""} onReply={onReply} />
        {sendError && (
          <Typography variant="caption" color="error" sx={{ px: 2, py: 0.5, flexShrink: 0 }}>
            Couldn&apos;t send: {sendError}
          </Typography>
        )}
        <Composer ref={composerRef} disabled={!connected} onSend={send} />
      </Box>
    );
  }

  // No conversation open: the recent-DM list (1:1 + group), most-recent-first,
  // with search and a "New message" action.
  const q = searchText.trim().toLowerCase();
  const visibleConversations = q
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.lastMessage ? snippet(c.lastMessage.body).toLowerCase().includes(q) : false),
      )
    : conversations;

  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto" }}>
      <Box sx={{ p: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search conversations"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          sx={{ mb: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Button
          fullWidth
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setComposeOpen(true)}
        >
          New message
        </Button>
      </Box>
      {visibleConversations.length === 0 ? (
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {q ? (
              <>No conversations match &ldquo;{searchText}&rdquo;.</>
            ) : (
              "No conversations yet. Start one with New message."
            )}
          </Typography>
        </Box>
      ) : (
        <List dense>
          {visibleConversations.map((c) => {
            const hasUnread = Boolean(unreadDms[c.conversationKey]);
            const others = c.participantIds.filter((id) => id !== selfId);
            const isGroup = others.length > 1;
            const solo = others.length === 1 ? usersById.get(others[0]!) : undefined;
            // Prefer first names built from the participant set; fall back to the
            // server-built title for people we haven't loaded yet.
            const resolved = others.map((id) => usersById.get(id)?.name).filter(Boolean) as string[];
            const title = resolved.length === others.length ? firstNames(resolved) : c.title;
            return (
              <ListItemButton
                key={c.conversationKey}
                onClick={() => setActiveParticipants(c.participantIds)}
              >
                {isGroup ? (
                  <Avatar sx={{ width: 36, height: 36, mr: 1.5 }}>
                    <GroupIcon fontSize="small" />
                  </Avatar>
                ) : (
                  <Avatar src={solo?.imageUrl} sx={{ width: 36, height: 36, mr: 1.5 }}>
                    {title.charAt(0)}
                  </Avatar>
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="baseline" spacing={1}>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ fontWeight: hasUnread ? 700 : 500, flex: 1, minWidth: 0 }}
                    >
                      {title}
                    </Typography>
                    {c.lastMessageTs && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ flexShrink: 0 }}
                      >
                        {relativeTime(c.lastMessageTs)}
                      </Typography>
                    )}
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: hasUnread ? 600 : 400,
                    }}
                  >
                    {c.lastMessage ? snippet(c.lastMessage.body) : "No messages yet"}
                  </Typography>
                </Box>
                {hasUnread && (
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: "secondary.main",
                      ml: 1,
                      flexShrink: 0,
                    }}
                  />
                )}
              </ListItemButton>
            );
          })}
        </List>
      )}
      <NewGroupDmDialog
        open={composeOpen}
        users={users}
        groups={groups}
        policy={policy}
        selfId={selfId}
        onClose={() => setComposeOpen(false)}
        onStart={(ids) => {
          setComposeOpen(false);
          setActiveParticipants(selfId != null ? [selfId, ...ids] : ids);
        }}
      />
    </Box>
  );
}

/**
 * "New message" picker: the group-organized people list (featured-expanded,
 * secondary-collapsed, "Others" gated behind "Show everyone"), with search and
 * multi-select for group DMs. "Start chat" hands the selected ids back to open
 * or create that conversation.
 */
function NewGroupDmDialog({
  open,
  users,
  groups,
  policy,
  selfId,
  onClose,
  onStart,
}: {
  open: boolean;
  users: ZulipUser[];
  groups: ZulipUserGroup[];
  policy: { featured: number[]; secondary: number[] } | null;
  selfId: number | null;
  onClose: () => void;
  onStart: (ids: number[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [searchText, setSearchText] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showEveryone, setShowEveryone] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setSearchText("");
      setShowEveryone(false);
      setCollapsed({});
    }
  }, [open]);

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allBuckets = buildBuckets(users, groups, policy, selfId);
  const searching = searchText.trim().length > 0;
  const hasOthers = allBuckets.some((b) => b.tier === "others");
  const groupedBuckets = allBuckets.filter((b) => b.tier !== "others");
  // Gate "others" behind "Show everyone" only when there are grouped buckets to
  // show first. With nothing grouped, show everyone so the list is never empty.
  const othersHidden = !searching && !showEveryone && groupedBuckets.length > 0;
  const visibleBuckets = othersHidden ? groupedBuckets : allBuckets;
  const buckets = searching ? filterBucketsBySearch(visibleBuckets, searchText) : visibleBuckets;

  const isOpen = (b: DmBucket): boolean => {
    if (searching) return true;
    if (b.id in collapsed) return !collapsed[b.id];
    return b.tier === "featured" || (b.tier === "others" && showEveryone);
  };
  const toggleBucket = (id: string) =>
    setCollapsed((c) => ({ ...c, [id]: !(c[id] ?? false) }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New message</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search people"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        {selected.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, display: "block" }}>
            {selected.length} selected
          </Typography>
        )}
        {users.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No people loaded yet.
            </Typography>
          </Box>
        ) : buckets.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {searching ? <>No people match &ldquo;{searchText}&rdquo;.</> : "No people to show."}
            </Typography>
          </Box>
        ) : (
          <List dense>
            {buckets.map((b) => {
              const expanded = isOpen(b);
              return (
                <Box key={b.id}>
                  <ListSubheader
                    disableSticky
                    component="div"
                    onClick={() => toggleBucket(b.id)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      cursor: "pointer",
                      lineHeight: "32px",
                      userSelect: "none",
                    }}
                  >
                    {expanded ? (
                      <ExpandMoreIcon fontSize="small" sx={{ mr: 0.5 }} />
                    ) : (
                      <ChevronRightIcon fontSize="small" sx={{ mr: 0.5 }} />
                    )}
                    {b.name}
                    <Chip label={b.users.length} size="small" sx={{ ml: 1, height: 18 }} />
                  </ListSubheader>
                  <Collapse in={expanded} timeout="auto" unmountOnExit>
                    {b.users.map((u) => (
                      <ListItemButton
                        key={u.zulipUserId}
                        sx={{ pl: 3 }}
                        onClick={() => toggle(u.zulipUserId)}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Checkbox
                            edge="start"
                            checked={selected.includes(u.zulipUserId)}
                            tabIndex={-1}
                            disableRipple
                          />
                        </ListItemIcon>
                        <Avatar src={u.imageUrl} sx={{ width: 28, height: 28, mr: 1 }}>
                          {u.name.charAt(0)}
                        </Avatar>
                        <ListItemText primary={firstName(u.name)} secondary={u.email} />
                      </ListItemButton>
                    ))}
                  </Collapse>
                </Box>
              );
            })}
          </List>
        )}
        {!searching && hasOthers && groupedBuckets.length > 0 && (
          <Box sx={{ px: 2, pb: 1.5, pt: 0.5 }}>
            <Button
              fullWidth
              size="small"
              variant="text"
              startIcon={showEveryone ? <ExpandMoreIcon /> : <ChevronRightIcon />}
              onClick={() => setShowEveryone((v) => !v)}
              sx={{ justifyContent: "flex-start", color: "text.secondary" }}
            >
              {showEveryone ? "Hide everyone else" : "Show everyone"}
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={selected.length === 0}
          onClick={() => onStart(selected)}
        >
          Start chat
        </Button>
      </DialogActions>
    </Dialog>
  );
}
