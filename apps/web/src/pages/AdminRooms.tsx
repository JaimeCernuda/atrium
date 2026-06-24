import { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import BuildIcon from "@mui/icons-material/Build";
import type { Room, ZulipUser } from "@atrium/shared";
import { useStore } from "../store";
import { getSocket } from "../socket";

// The Zulip "students" user group — every member gets a desk in the bulk seed.
const STUDENTS_GROUP_ID = 316940;
const DESK_CATEGORY = "Desks";

// Broad shared-discussion rooms — normal shared rooms (no owner) bound to a
// matching Zulip channel, rendered on the Projects row.
const SHARED_CATEGORY = "Projects";
const SHARED_COLOR = "#388e3c";
const SHARED_PROJECTS = ["Agentic", "IOWarp", "Jarvis", "ChronoLog", "Paper Reading"];

// Per-student desk -> project channel(s). Jie Ye's single desk binds both DyTO
// and Pythia (Pythia is folded into Jie's desk, not a standalone desk). Izzet's
// desk has no channel bound.
const STUDENT_DESK_BINDINGS: { studentName: string; channelNames: string[] }[] = [
  { studentName: "Rajni Pawar", channelNames: ["Acropolis"] },
  { studentName: "Neeraj Rajesh", channelNames: ["Aneris"] },
  { studentName: "Hua Xu", channelNames: ["Coeus"] },
  { studentName: "Keith Bateman", channelNames: ["DTIO"] },
  { studentName: "Jie Ye", channelNames: ["DyTO", "Pythia"] },
  { studentName: "Shazzadul Islam", channelNames: ["Fine-Tuning"] },
  { studentName: "Isa Muradli", channelNames: ["GPUCompress"] },
  { studentName: "Zia Uddin Chowdhury", channelNames: ["KV_Lobotomy"] },
  { studentName: "Meng Tang", channelNames: ["Widget"] },
  { studentName: "Izzet Yildirim", channelNames: [] },
];

// Match Zulip channels & students by a loose key: case-insensitive, with spaces/
// hyphens/underscores and parenthetical suffixes ("(Candice)") stripped — so
// Fine-Tuning<->Fine-Tunning, KV_Lobotomy<->Lobotomy, WIDGET<->Widget and
// "Meng Tang (Candice)"<->"Meng Tang" all resolve. Strip parentheticals BEFORE
// collapsing whitespace so the surrounding space vanishes cleanly.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s\-_]+/g, "")
    .trim();
}

const isDeskRoom = (r: Room): boolean => (r.category ?? "").toLowerCase() === "desks";

function emptyRoom(): Room {
  return {
    id: "",
    name: "",
    color: "",
    category: "",
    disableMeeting: false,
    externalMeetUrl: "",
    zulipStreamIds: [],
  };
}

function emptyDesk(): Room {
  return {
    id: "",
    name: "",
    color: "",
    category: DESK_CATEGORY,
    ownerEmail: "",
    disableMeeting: false,
    externalMeetUrl: "",
    zulipStreamIds: [],
  };
}

async function fetchRooms(): Promise<Room[]> {
  const res = await fetch("/api/rooms", { credentials: "include" });
  return res.json() as Promise<Room[]>;
}

function randomId(): string {
  return crypto.randomUUID();
}

export function AdminRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editing, setEditing] = useState<Room | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const channels = useStore((s) => s.zulipChannels);
  const zulipUsers = useStore((s) => s.zulipUsers);
  const zulipUserGroups = useStore((s) => s.zulipUserGroups);
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const userByEmail = new Map(zulipUsers.map((u) => [u.email.toLowerCase(), u]));

  // Render every channel a room is bound to (multi-channel), falling back to the
  // legacy single id for rooms not yet migrated.
  const boundChannelsLabel = (r: Room): string => {
    const ids = r.zulipStreamIds?.length
      ? r.zulipStreamIds
      : r.zulipStreamId != null
        ? [r.zulipStreamId]
        : [];
    return ids.length
      ? ids.map((id) => `#${channelById.get(id)?.name ?? id}`).join(", ")
      : "—";
  };

  const desks = rooms.filter(isDeskRoom);
  const nonDeskRooms = rooms.filter((r) => !isDeskRoom(r));

  const refresh = () => {
    fetchRooms().then(setRooms).catch(console.error);
  };

  useEffect(refresh, []);

  // Load Zulip channels for the binding dropdown. Admins at GRC are Zulip
  // admins, so the full channel list is fair game (no privacy gating).
  useEffect(() => {
    getSocket().emit("zulip:fetch-channels");
  }, []);

  const save = async () => {
    if (!editing) return;
    const method = isNew ? "POST" : "PATCH";
    const url = isNew ? "/api/rooms" : `/api/rooms/${editing.id}`;
    // Send zulipStreamIds + ownerEmail explicitly (null/empty clears them); the
    // server treats an absent field as "leave unchanged", so always provide a
    // value. ownerEmail is lowercased for case-insensitive owner matching.
    const payload = {
      ...editing,
      zulipStreamIds: editing.zulipStreamIds ?? null,
      ownerEmail: editing.ownerEmail ? editing.ownerEmail.trim().toLowerCase() : null,
    };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      alert(`Save failed: ${res.status}`);
      return;
    }
    setEditing(null);
    refresh();
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete room ${id}?`)) return;
    const res = await fetch(`/api/rooms/${id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) alert(`Delete failed: ${res.status}`);
    refresh();
  };

  // Seeds a desk for every member of the Zulip "students" group. Channels stay
  // unbound until an admin binds them per desk. Skips students who already own a
  // desk so a second run is safe.
  const seedStudentDesks = async () => {
    const group =
      zulipUserGroups.find((g) => g.id === STUDENTS_GROUP_ID) ??
      zulipUserGroups.find((g) => g.name.toLowerCase() === "students");
    if (!group) {
      alert("The Zulip 'students' group isn't loaded yet. Open the chat once to load Zulip data, then retry.");
      return;
    }
    const memberById = new Map(zulipUsers.map((u) => [u.zulipUserId, u]));
    const students = group.memberIds
      .map((id) => memberById.get(id))
      .filter((u): u is ZulipUser => !!u && !!u.email);
    const existingOwners = new Set(
      rooms.filter(isDeskRoom).map((r) => (r.ownerEmail ?? "").toLowerCase()),
    );

    setSeeding(true);
    let created = 0;
    let skipped = 0;
    let failed = 0;
    for (const student of students) {
      const email = student.email.toLowerCase();
      if (existingOwners.has(email)) {
        skipped++;
        continue;
      }
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: randomId(),
          name: student.name,
          category: DESK_CATEGORY,
          ownerEmail: email,
          zulipStreamId: null,
        }),
      });
      if (res.ok) {
        created++;
        existingOwners.add(email);
      } else {
        failed++;
      }
    }
    setSeeding(false);
    setSeedResult(
      `${created} desk${created === 1 ? "" : "s"} created, ${skipped} skipped (already existed)` +
        (failed > 0 ? `, ${failed} failed` : "") +
        ". Bind each desk's Zulip channel from its row.",
    );
    refresh();
  };

  // Idempotent lab setup: creates each student's desk bound to their project
  // channel(s) and the broad shared rooms. De-dupes desks by owner email and
  // shared rooms by lowercased name, so a re-run never duplicates or double-binds.
  // Channels and students are matched case-insensitively by name; any unmatched
  // name is skipped and reported rather than failing the whole run.
  const setupLab = async () => {
    setSeeding(true);
    const channelByName = new Map(channels.map((c) => [normalizeForMatch(c.name), c]));
    const userByName = new Map(zulipUsers.map((u) => [normalizeForMatch(u.name), u]));
    const existingOwners = new Set(
      rooms
        .filter(isDeskRoom)
        .map((r) => (r.ownerEmail ?? "").toLowerCase())
        .filter(Boolean),
    );
    // Match the broad shared rooms by NAME regardless of category/owner: the
    // live DB seeds these from config/rooms.json with categories backfilled from
    // color (e.g. ChronoLog lands in "Engineering", not "Projects"), so a
    // category filter would miss them and POST a duplicate. Keyed by lowercased
    // name -> existing room so we can re-bind/re-categorize in place instead.
    const existingSharedByName = new Map(
      rooms
        .filter((r) => !r.ownerEmail && !isDeskRoom(r))
        .map((r) => [r.name.toLowerCase(), r] as const),
    );
    const res = {
      deskCreated: 0,
      deskSkipped: 0,
      projCreated: 0,
      projSkipped: 0,
      failed: 0,
      unmatched: [] as string[],
    };

    for (const b of STUDENT_DESK_BINDINGS) {
      const u = userByName.get(normalizeForMatch(b.studentName));
      if (!u) {
        res.unmatched.push(`student "${b.studentName}"`);
        continue;
      }
      const email = u.email.toLowerCase();
      const ids: number[] = [];
      for (const cn of b.channelNames) {
        const ch = channelByName.get(normalizeForMatch(cn));
        if (ch) ids.push(ch.id);
        else res.unmatched.push(`channel "${cn}" (for ${b.studentName})`);
      }
      const existingDesk = rooms.find(
        (r) => isDeskRoom(r) && (r.ownerEmail ?? "").toLowerCase() === email,
      );
      if (existingDesk) {
        // Re-bind: union current + intended channels so a re-run ADDS (e.g. Jie's
        // Pythia onto an existing DyTO desk) without dropping anything.
        const boundIds = [...(existingDesk.zulipStreamIds ?? [])].sort((a, b) => a - b);
        const merged = Array.from(new Set([...boundIds, ...ids])).sort((a, b) => a - b);
        const same =
          merged.length === boundIds.length && merged.every((x, i) => x === boundIds[i]);
        if (same) {
          res.deskSkipped++;
        } else {
          const r = await fetch(`/api/rooms/${existingDesk.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ zulipStreamIds: merged }),
          });
          if (r.ok) res.deskSkipped++;
          else res.failed++;
        }
      } else {
        const r = await fetch("/api/rooms", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: randomId(),
            name: u.name,
            category: DESK_CATEGORY,
            ownerEmail: email,
            zulipStreamIds: ids,
          }),
        });
        if (r.ok) {
          res.deskCreated++;
          existingOwners.add(email);
        } else res.failed++;
      }

      // Supersede the matching "Papers" research room (hide, reversible) once
      // this student has a desk. The room is named after the PROJECT/channel
      // (e.g. "Coeus"), not the student, so match against the channel names.
      // Idempotent: PATCH superseded:true only when not already set.
      const papersRoom = nonDeskRooms.find(
        (r) =>
          (r.category ?? "").toLowerCase() === "papers" &&
          b.channelNames.some(
            (cn) => normalizeForMatch(r.name) === normalizeForMatch(cn),
          ),
      );
      if (papersRoom && !papersRoom.superseded) {
        const r = await fetch(`/api/rooms/${papersRoom.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ superseded: true }),
        });
        if (!r.ok) res.failed++;
      }
    }

    for (const name of SHARED_PROJECTS) {
      const ch = channelByName.get(normalizeForMatch(name));
      if (!ch && name !== "Paper Reading") res.unmatched.push(`project channel "${name}"`);
      const ids = ch ? [ch.id] : [];
      const existing = existingSharedByName.get(name.toLowerCase());
      if (existing) {
        // Already present (possibly under a backfilled category like
        // "Engineering"): re-home it into the shared Projects row and bind its
        // channel in place rather than creating a duplicate.
        const boundIds = existing.zulipStreamIds ?? [];
        const merged = ids.length
          ? Array.from(new Set([...boundIds, ...ids]))
          : boundIds;
        const r = await fetch(`/api/rooms/${existing.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: SHARED_CATEGORY,
            color: SHARED_COLOR,
            zulipStreamIds: merged,
          }),
        });
        if (r.ok) res.projSkipped++;
        else res.failed++;
        continue;
      }
      const r = await fetch("/api/rooms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: randomId(),
          name,
          category: SHARED_CATEGORY,
          color: SHARED_COLOR,
          ownerEmail: null,
          zulipStreamIds: ids,
        }),
      });
      if (r.ok) {
        res.projCreated++;
      } else res.failed++;
    }

    setSeeding(false);
    const parts = [
      `${res.deskCreated} desk(s) created`,
      `${res.deskSkipped} skipped`,
      `${res.projCreated} project room(s) created`,
      `${res.projSkipped} skipped`,
    ];
    if (res.failed) parts.push(`${res.failed} failed`);
    setSeedResult(
      parts.join(", ") +
        (res.unmatched.length ? `\n\nUnmatched: ${res.unmatched.join("; ")}` : ""),
    );
    refresh();
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h4">Rooms</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditing({ ...emptyRoom(), id: randomId() });
            setIsNew(true);
          }}
        >
          New room
        </Button>
      </Stack>

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Color</TableCell>
              <TableCell>Zulip channel</TableCell>
              <TableCell>Meeting URL</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {nonDeskRooms.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.category ?? "—"}</TableCell>
                <TableCell>
                  {r.color && (
                    <Box
                      sx={{ width: 20, height: 20, borderRadius: 0.5, bgcolor: r.color, display: "inline-block" }}
                    />
                  )}
                </TableCell>
                <TableCell>{boundChannelsLabel(r)}</TableCell>
                <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.externalMeetUrl ?? (r.disableMeeting ? "(no meeting)" : "—")}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => { setEditing(r); setIsNew(false); }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => remove(r.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mt: 4, mb: 2 }}
      >
        <Box>
          <Typography variant="h4">Desks</Typography>
          <Typography variant="body2" color="text.secondary">
            A desk is a person. Each student gets a desk bound to their project channel.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<BuildIcon />}
            onClick={setupLab}
            disabled={seeding}
          >
            {seeding ? "Setting up…" : "Set up lab desks & projects"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<GroupAddIcon />}
            onClick={seedStudentDesks}
            disabled={seeding}
          >
            {seeding ? "Seeding…" : "Create desks for students"}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditing({ ...emptyDesk(), id: randomId() });
              setIsNew(true);
            }}
          >
            New desk
          </Button>
        </Stack>
      </Stack>

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Desk</TableCell>
              <TableCell>Owner</TableCell>
              <TableCell>Zulip channel</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {desks.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                    No desks yet. Seed them from the students group or add one.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {desks.map((r) => {
              const owner = r.ownerEmail ? userByEmail.get(r.ownerEmail.toLowerCase()) : undefined;
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.name || "(unnamed)"}</TableCell>
                  <TableCell>
                    {owner ? `${owner.name} <${owner.email}>` : (r.ownerEmail ?? "—")}
                  </TableCell>
                  <TableCell>{boundChannelsLabel(r)}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => { setEditing(r); setIsNew(false); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => remove(r.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={!!seedResult} onClose={() => setSeedResult(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Desks seeded</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>{seedResult}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeedResult(null)}>Done</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editing && isDeskRoom(editing)
            ? isNew
              ? "New desk"
              : "Edit desk"
            : isNew
              ? "New room"
              : "Edit room"}
        </DialogTitle>
        {editing && (
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                fullWidth
              />
              <TextField
                label="Category"
                value={editing.category ?? ""}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                helperText='Free-form label used to group rooms (e.g. Papers, Offices). "Desks" renders a per-student desk.'
                fullWidth
              />
              <Autocomplete<ZulipUser, false, false, true>
                freeSolo
                options={zulipUsers}
                getOptionLabel={(o) =>
                  typeof o === "string" ? o : `${o.name} <${o.email}>`
                }
                value={
                  editing.ownerEmail
                    ? (userByEmail.get(editing.ownerEmail.toLowerCase()) ?? editing.ownerEmail)
                    : null
                }
                onChange={(_e, val) =>
                  setEditing({
                    ...editing,
                    ownerEmail:
                      val == null
                        ? ""
                        : typeof val === "string"
                          ? val
                          : val.email,
                  })
                }
                onInputChange={(_e, text, reason) => {
                  // Keep raw typing in sync (covers emails not in the Zulip list).
                  if (reason === "input") setEditing({ ...editing, ownerEmail: text });
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Owner"
                    helperText={
                      isDeskRoom(editing)
                        ? "The person this desk belongs to. They can rename and decorate it."
                        : "Optional. The owner can lock and decorate this room."
                    }
                  />
                )}
              />
              <TextField
                label="Color (hex)"
                value={editing.color ?? ""}
                onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                placeholder="#1976d2"
                fullWidth
              />
              <Box>
                <Typography variant="subtitle2">Bound channels</Typography>
                <Typography variant="caption" color="text.secondary">
                  Bind this room to one or more Zulip channels. Each gets its own jump chip.
                </Typography>
                <Stack spacing={0} sx={{ mt: 0.5, maxHeight: 220, overflowY: "auto" }}>
                  {channels.map((c) => {
                    const arr =
                      editing.zulipStreamIds ??
                      (editing.zulipStreamId != null ? [editing.zulipStreamId] : []);
                    return (
                      <FormControlLabel
                        key={c.id}
                        control={
                          <Checkbox
                            size="small"
                            checked={arr.includes(c.id)}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                zulipStreamIds: e.target.checked
                                  ? [...arr, c.id]
                                  : arr.filter((x) => x !== c.id),
                              })
                            }
                          />
                        }
                        label={`# ${c.name}`}
                      />
                    );
                  })}
                </Stack>
              </Box>
              <TextField
                label="External meeting URL"
                value={editing.externalMeetUrl ?? ""}
                onChange={(e) => setEditing({ ...editing, externalMeetUrl: e.target.value })}
                placeholder="https://meet.jcernuda.com/room-slug"
                fullWidth
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editing.disableMeeting ?? false}
                    onChange={(e) => setEditing({ ...editing, disableMeeting: e.target.checked })}
                  />
                }
                label="Disable meeting button (lobby-style rooms)"
              />
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
