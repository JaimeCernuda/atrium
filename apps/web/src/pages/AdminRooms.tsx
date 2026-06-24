import { useEffect, useState } from "react";
import {
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
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { MenuItem } from "@mui/material";
import type { Room } from "@atrium/shared";
import { useStore } from "../store";
import { getSocket } from "../socket";

function emptyRoom(): Room {
  return { id: "", name: "", color: "", category: "", disableMeeting: false, externalMeetUrl: "" };
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
  const channels = useStore((s) => s.zulipChannels);
  const channelById = new Map(channels.map((c) => [c.id, c]));

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
    // Send zulipStreamId explicitly (null clears the binding); the server treats
    // an absent field as "leave unchanged", so we always provide a value.
    const payload = { ...editing, zulipStreamId: editing.zulipStreamId ?? null };
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
            {rooms.map((r) => (
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

      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{isNew ? "New room" : "Edit room"}</DialogTitle>
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
                helperText="Free-form label used to group rooms (e.g. Papers, Projects, Offices)."
                fullWidth
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
