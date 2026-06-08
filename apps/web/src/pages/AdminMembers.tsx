import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Chip,
  Container,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Link as RouterLink } from "react-router-dom";
import type { Member, RoleInfo } from "@atrium/shared";
import { useStore } from "../store";

const NO_OFFICE = "__none__";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export function AdminMembers() {
  const me = useStore((s) => s.user);
  const rooms = useStore((s) => s.rooms);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const offices = rooms.filter((r) => r.category === "Offices");

  const load = useCallback(() => {
    Promise.all([
      api<{ items: Member[] }>("/api/members"),
      api<{ roles: RoleInfo[] }>("/api/roles"),
    ])
      .then(([m, r]) => {
        setMembers(m.items);
        setRoles(r.roles);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchMember = async (member: Member, patch: { role?: string; officeRoomId?: string | null }) => {
    try {
      const updated = await api<Member>(`/api/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMembers((ms) => ms.map((m) => (m.id === updated.id ? updated : m)));
      // Office reassignment can displace another member's office — refresh all.
      if (patch.officeRoomId !== undefined) load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, flexGrow: 1 }}>
          Members
        </Typography>
        <Button startIcon={<RefreshIcon />} onClick={load}>
          Refresh
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Everyone who has ever signed in. Assign roles and offices here; permissions per role are
        edited on the Roles page.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>Member</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Office</TableCell>
              <TableCell>Last seen</TableCell>
              <TableCell>Joined</TableCell>
              <TableCell align="center">Submissions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ color: "text.secondary" }}>
                  No members yet.
                </TableCell>
              </TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.id} hover>
                <TableCell sx={{ width: 48 }}>
                  <Avatar src={m.imageUrl ?? undefined} alt={m.name} sx={{ width: 34, height: 34 }}>
                    {m.name.charAt(0)}
                  </Avatar>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {m.name}
                    {m.id === me?.id && (
                      <Chip size="small" label="you" variant="outlined" sx={{ ml: 0.75 }} />
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {m.email}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={m.role}
                    disabled={m.id === me?.id}
                    onChange={(e) => patchMember(m, { role: e.target.value })}
                    sx={{ minWidth: 130, fontSize: "0.875rem" }}
                  >
                    {roles.map((r) => (
                      <MenuItem key={r.id} value={r.id}>
                        {r.name}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={m.office?.id ?? NO_OFFICE}
                    onChange={(e) =>
                      patchMember(m, {
                        officeRoomId: e.target.value === NO_OFFICE ? null : e.target.value,
                      })
                    }
                    sx={{ minWidth: 140, fontSize: "0.875rem" }}
                  >
                    <MenuItem value={NO_OFFICE}>
                      <em>None</em>
                    </MenuItem>
                    {offices.map((o) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.name}
                      </MenuItem>
                    ))}
                    {/* Keep showing an office that exists but isn't categorized as "Offices" */}
                    {m.office && !offices.some((o) => o.id === m.office!.id) && (
                      <MenuItem value={m.office.id}>{m.office.name}</MenuItem>
                    )}
                  </Select>
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{relativeTime(m.lastSeenAt)}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {new Date(m.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell align="center">
                  <Link
                    component={RouterLink}
                    to={`/members/${m.id}/submissions`}
                    underline="hover"
                    sx={{ fontWeight: 600 }}
                  >
                    {m.submissionCount}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Container>
  );
}
