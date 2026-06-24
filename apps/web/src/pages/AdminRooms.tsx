import { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
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
import { MenuItem } from "@mui/material";
import type { Room, ZulipUser } from "@atrium/shared";
import { useStore } from "../store";
import { getSocket } from "../socket";

// The Zulip "students" user group — every member gets a desk in the bulk seed.
const STUDENTS_GROUP_ID = 316940;
const DESK_CATEGORY = "Desks";

const isDeskRoom = (r: Room): boolean => (r.category ?? "").toLowerCase() === "desks";

function emptyRoom(): Room {
  return { id: "", name: "", color: "", category: "", disableMeeting: false, externalMeetUrl: "" };
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
    // Send zulipStreamId + ownerEmail explicitly (null/empty clears them); the
    // server treats an absent field as "leave unchanged", so always provide a
    // value. ownerEmail is lowercased for case-insensitive owner matching.
    const payload = {
      ...editing,
      zulipStreamId: editing.zulipStreamId ?? null,
      ownerEmail: editing.ownerEmail ? editing.ownerEmail.trim().toLowerCase() : null,
    };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      if (res.status === 409) {
        alert("That Zulip channel is already bound to another room.");
      } else {
        alert(`Save failed: ${res.status}`);
      }
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
                <TableCell>
                  {r.zulipStreamId != null
                    ? `#${channelById.get(r.zulipStreamId)?.name ?? r.zulipStreamId}`
                    : "—"}
                </TableCell>
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
                  <TableCell>
                    {r.zulipStreamId != null
                      ? `#${channelById.get(r.zulipStreamId)?.name ?? r.zulipStreamId}`
                      : "—"}
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
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={!!seedResult} onClose={() => setSeedResult(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Desks seeded</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{seedResult}</Typography>
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
              <TextField
                select
                label="Zulip channel"
                value={editing.zulipStreamId ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    zulipStreamId: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                helperText="Bind this room to a Zulip channel. Entering the room opens that channel's topics."
                fullWidth
              >
                <MenuItem value="">(None)</MenuItem>
                {channels.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    #{c.name}
                  </MenuItem>
                ))}
              </TextField>
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
