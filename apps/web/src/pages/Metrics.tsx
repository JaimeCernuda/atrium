import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../store";

interface SummaryResp {
  users: number;
  activeSessions: number;
  activeMeetings: number;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

interface ActiveSessionRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  imageUrl: string | null;
  roomId: string;
  joinedAt: string;
}

interface ActiveMeetingRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  imageUrl: string | null;
  roomId: string;
  startedAt: string;
}

interface RoomTimeRow {
  userId: string;
  userName: string;
  roomId: string;
  totalSeconds: number;
  sessions: number;
}

interface DailyRow {
  day: string;
  uniqueUsers: number;
  roomSeconds: number;
  meetingSeconds: number;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

function fmtAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

type CardKind = "users" | "sessions" | "meetings";

export function Metrics() {
  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState<SummaryResp | null>(null);
  const [roomTime, setRoomTime] = useState<RoomTimeRow[] | null>(null);
  const [meetingTime, setMeetingTime] = useState<RoomTimeRow[] | null>(null);
  const [daily, setDaily] = useState<DailyRow[] | null>(null);
  const [openCard, setOpenCard] = useState<CardKind | null>(null);

  useEffect(() => {
    getJson<SummaryResp>("/api/metrics/summary").then(setSummary).catch(console.error);
    getJson<{ rows: RoomTimeRow[] }>("/api/metrics/room-time")
      .then((r) => setRoomTime(r.rows))
      .catch(console.error);
    getJson<{ rows: RoomTimeRow[] }>("/api/metrics/meeting-time")
      .then((r) => setMeetingTime(r.rows))
      .catch(console.error);
    getJson<{ rows: DailyRow[] }>("/api/metrics/daily-activity")
      .then((r) => setDaily(r.rows))
      .catch(console.error);
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        Metrics
      </Typography>

      {summary ? (
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <SummaryCard
            label="Registered users"
            value={summary.users}
            onClick={() => setOpenCard("users")}
          />
          <SummaryCard
            label="In rooms now"
            value={summary.activeSessions}
            onClick={() => setOpenCard("sessions")}
          />
          <SummaryCard
            label="In meetings now"
            value={summary.activeMeetings}
            onClick={() => setOpenCard("meetings")}
          />
        </Stack>
      ) : (
        <CircularProgress size={20} />
      )}

      <Paper>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Room time" />
          <Tab label="Meeting time" />
          <Tab label="Daily activity" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          {tab === 0 && <UserRoomTable rows={roomTime} />}
          {tab === 1 && <UserRoomTable rows={meetingTime} />}
          {tab === 2 && <DailyTable rows={daily} />}
        </Box>
      </Paper>

      <DetailDialog kind={openCard} onClose={() => setOpenCard(null)} />
    </Container>
  );
}

function SummaryCard({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 2,
        minWidth: 160,
        cursor: "pointer",
        transition: (t) =>
          t.transitions.create(["background-color", "transform"], { duration: 120 }),
        "&:hover": {
          bgcolor: "action.hover",
        },
        "&:active": { transform: "translateY(1px)" },
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4">{value}</Typography>
      <Typography variant="caption" color="primary" sx={{ mt: 0.5, display: "block" }}>
        Click to see who →
      </Typography>
    </Paper>
  );
}

function DetailDialog({ kind, onClose }: { kind: CardKind | null; onClose: () => void }) {
  const rooms = useStore((s) => s.rooms);
  const roomNameById = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms]);

  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [sessions, setSessions] = useState<ActiveSessionRow[] | null>(null);
  const [meetings, setMeetings] = useState<ActiveMeetingRow[] | null>(null);

  useEffect(() => {
    if (!kind) return;
    if (kind === "users" && users === null) {
      getJson<{ rows: UserRow[] }>("/api/metrics/users")
        .then((r) => setUsers(r.rows))
        .catch(console.error);
    } else if (kind === "sessions") {
      getJson<{ rows: ActiveSessionRow[] }>("/api/metrics/active-sessions")
        .then((r) => setSessions(r.rows))
        .catch(console.error);
    } else if (kind === "meetings") {
      getJson<{ rows: ActiveMeetingRow[] }>("/api/metrics/active-meetings")
        .then((r) => setMeetings(r.rows))
        .catch(console.error);
    }
  }, [kind, users]);

  const titles: Record<CardKind, string> = {
    users: "Registered users",
    sessions: "In rooms now",
    meetings: "In meetings now",
  };

  return (
    <Dialog open={kind !== null} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center" }}>
        <Box sx={{ flexGrow: 1 }}>{kind ? titles[kind] : ""}</Box>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {kind === "users" && (
          users === null ? (
            <CircularProgress size={20} />
          ) : users.length === 0 ? (
            <Typography color="text.secondary">No users.</Typography>
          ) : (
            <List disablePadding>
              {users.map((u) => (
                <ListItem key={u.id} disableGutters>
                  <ListItemAvatar>
                    <Avatar src={u.imageUrl ?? undefined}>{u.name[0]?.toUpperCase()}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box>{u.name}</Box>
                        {u.isAdmin && (
                          <Chip size="small" label="admin" color="primary" variant="outlined" />
                        )}
                      </Stack>
                    }
                    secondary={
                      <>
                        <Box component="span" sx={{ display: "block" }}>{u.email}</Box>
                        <Box component="span" sx={{ display: "block", fontSize: "0.75rem" }}>
                          joined {new Date(u.createdAt).toLocaleDateString()}
                          {u.lastSeenAt ? ` · last seen ${fmtAgo(u.lastSeenAt)}` : ""}
                        </Box>
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )
        )}

        {kind === "sessions" && (
          sessions === null ? (
            <CircularProgress size={20} />
          ) : sessions.length === 0 ? (
            <Typography color="text.secondary">Nobody is in a room right now.</Typography>
          ) : (
            <List disablePadding>
              {sessions.map((s) => (
                <ListItem key={s.id} disableGutters>
                  <ListItemAvatar>
                    <Avatar src={s.imageUrl ?? undefined}>{s.userName[0]?.toUpperCase()}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={s.userName}
                    secondary={
                      <>
                        <Box component="span" sx={{ display: "block" }}>
                          in <strong>{roomNameById.get(s.roomId) ?? s.roomId}</strong> · since {fmtAgo(s.joinedAt)}
                        </Box>
                        <Box component="span" sx={{ display: "block", fontSize: "0.75rem", color: "text.secondary" }}>
                          {s.userEmail}
                        </Box>
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )
        )}

        {kind === "meetings" && (
          meetings === null ? (
            <CircularProgress size={20} />
          ) : meetings.length === 0 ? (
            <Typography color="text.secondary">No one is in a meeting right now.</Typography>
          ) : (
            <List disablePadding>
              {meetings.map((m) => (
                <ListItem key={m.id} disableGutters>
                  <ListItemAvatar>
                    <Avatar src={m.imageUrl ?? undefined}>{m.userName[0]?.toUpperCase()}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={m.userName}
                    secondary={
                      <>
                        <Box component="span" sx={{ display: "block" }}>
                          meeting in <strong>{roomNameById.get(m.roomId) ?? m.roomId}</strong> · {fmtAgo(m.startedAt)}
                        </Box>
                        <Box component="span" sx={{ display: "block", fontSize: "0.75rem", color: "text.secondary" }}>
                          {m.userEmail}
                        </Box>
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserRoomTable({ rows }: { rows: RoomTimeRow[] | null }) {
  if (!rows) return <CircularProgress size={20} />;
  if (rows.length === 0) return <Typography color="text.secondary">No data yet.</Typography>;
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>User</TableCell>
          <TableCell>Room</TableCell>
          <TableCell align="right">Sessions</TableCell>
          <TableCell align="right">Time</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.userId}-${r.roomId}`}>
            <TableCell>{r.userName}</TableCell>
            <TableCell>{r.roomId}</TableCell>
            <TableCell align="right">{r.sessions}</TableCell>
            <TableCell align="right">{fmtDuration(r.totalSeconds)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DailyTable({ rows }: { rows: DailyRow[] | null }) {
  if (!rows) return <CircularProgress size={20} />;
  if (rows.length === 0) return <Typography color="text.secondary">No data yet.</Typography>;
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Day</TableCell>
          <TableCell align="right">Unique users</TableCell>
          <TableCell align="right">Total room time</TableCell>
          <TableCell align="right">Total meeting time</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.day}>
            <TableCell>{r.day.slice(0, 10)}</TableCell>
            <TableCell align="right">{r.uniqueUsers}</TableCell>
            <TableCell align="right">{fmtDuration(r.roomSeconds)}</TableCell>
            <TableCell align="right">{fmtDuration(r.meetingSeconds)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
