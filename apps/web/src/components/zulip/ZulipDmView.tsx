import { useEffect, useState } from "react";
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
import type { ZulipUser, ZulipUserGroup } from "@atrium/shared";
import { participantKey } from "@atrium/shared";
import { useStore } from "../../store";
import { getSocket } from "../../socket";
import { UnlinkedZulipFallback } from "../UnlinkedZulipFallback";
import { MessageList, Composer, openZulip } from "./chatPrimitives";

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

/**
 * Unified Zulip DM surface: a user-group-grouped people list (featured-expanded,
 * secondary-collapsed, "Others" gated behind "Show everyone"), a group-DM "New
 * message" dialog, and the selected conversation's message stream + composer.
 * Shared store + zulip:* socket events keep it identical across the drawer and
 * the full-page client.
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
  const [composeOpen, setComposeOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // "Others" (people outside any featured/secondary group) stays hidden until
  // the reader asks to see everyone. Search ignores this gate (see below).
  const [showEveryone, setShowEveryone] = useState(false);

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

  // No conversation open: grouped, collapsible people list + a "New message"
  // action for group DMs. Search matches across everyone.
  const allBuckets = buildBuckets(users, groups, policy, selfId);
  const searching = searchText.trim().length > 0;
  // The "others" bucket (hidden-group members + ungrouped people) is gated
  // behind "Show everyone" when not searching. Search reaches everyone, so
  // while searching every matching bucket — others included — is shown.
  const hasOthers = allBuckets.some((b) => b.tier === "others");
  const visibleBuckets =
    searching || showEveryone ? allBuckets : allBuckets.filter((b) => b.tier !== "others");
  const buckets = searching ? filterBucketsBySearch(visibleBuckets, searchText) : visibleBuckets;

  // Default expansion: featured expanded; secondary + others collapsed. While
  // searching, every matching bucket is force-expanded.
  const isOpen = (b: DmBucket): boolean => {
    if (searching) return true;
    if (b.id in collapsed) return !collapsed[b.id];
    // Featured is expanded by default; "others" expands when freshly revealed
    // via "Show everyone"; secondary stays collapsed-but-visible.
    return b.tier === "featured" || (b.tier === "others" && showEveryone);
  };
  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !(c[id] ?? false) }));

  const renderUser = (u: ZulipUser) => (
    <ListItemButton
      key={u.zulipUserId}
      sx={{ pl: 3 }}
      onClick={() =>
        setActiveParticipants(selfId != null ? [selfId, u.zulipUserId] : [u.zulipUserId])
      }
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
  );

  return (
    <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
      <Box sx={{ p: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search people"
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
      {users.length === 0 ? (
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No people loaded yet.
          </Typography>
        </Box>
      ) : buckets.length === 0 ? (
        <Box sx={{ px: 2, pb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No people match &ldquo;{searchText}&rdquo;.
          </Typography>
        </Box>
      ) : (
        <List dense>
          {buckets.map((b) => {
            const open = isOpen(b);
            return (
              <Box key={b.id}>
                <ListSubheader
                  disableSticky
                  component="div"
                  onClick={() => toggle(b.id)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    lineHeight: "32px",
                    userSelect: "none",
                  }}
                >
                  {open ? (
                    <ExpandMoreIcon fontSize="small" sx={{ mr: 0.5 }} />
                  ) : (
                    <ChevronRightIcon fontSize="small" sx={{ mr: 0.5 }} />
                  )}
                  {b.name}
                  <Chip label={b.users.length} size="small" sx={{ ml: 1, height: 18 }} />
                </ListSubheader>
                <Collapse in={open} timeout="auto" unmountOnExit>
                  {b.users.map(renderUser)}
                </Collapse>
              </Box>
            );
          })}
        </List>
      )}
      {/* Gate for the "Others" section: only when not searching and the bucket
          exists. Search already surfaces everyone, so the toggle is hidden. */}
      {!searching && hasOthers && (
        <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
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
