import { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  Container,
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

interface SummaryResp {
  users: number;
  activeSessions: number;
  activeMeetings: number;
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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export function Metrics() {
  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState<SummaryResp | null>(null);
  const [roomTime, setRoomTime] = useState<RoomTimeRow[] | null>(null);
  const [meetingTime, setMeetingTime] = useState<RoomTimeRow[] | null>(null);
  const [daily, setDaily] = useState<DailyRow[] | null>(null);

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
          <SummaryCard label="Registered users" value={summary.users} />
          <SummaryCard label="In rooms now" value={summary.activeSessions} />
          <SummaryCard label="In meetings now" value={summary.activeMeetings} />
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
    </Container>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Paper sx={{ p: 2, minWidth: 160 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4">{value}</Typography>
    </Paper>
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
