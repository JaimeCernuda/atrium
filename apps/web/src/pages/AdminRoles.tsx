import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import LockIcon from "@mui/icons-material/Lock";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { PermissionKey, RoleInfo } from "@atrium/shared";
import { useStore } from "../store";

/** Human labels for permission keys (falls back to the raw key). */
const PERMISSION_LABELS: Record<string, string> = {
  manage_rooms: "Manage rooms",
  manage_members: "Manage members",
  manage_roles: "Manage roles",
  manage_bots: "Manage bots",
  view_metrics: "View metrics",
  view_all_submissions: "View all submissions",
  manage_submissions: "Cancel/delete submissions",
  submit: "Submit papers",
  create_reminders: "Create reminders",
  write_digest: "Manage digests",
  own_office: "Own an office",
};

/** Owner can never lose these (mirrors the server guardrail). */
const OWNER_LOCKED: PermissionKey[] = ["manage_roles", "manage_members"];

interface RolesResponse {
  roles: RoleInfo[];
  allKeys: PermissionKey[];
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

export function AdminRoles() {
  const me = useStore((s) => s.user);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [allKeys, setAllKeys] = useState<PermissionKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<RoleInfo | null>(null);
  const [deleting, setDeleting] = useState<RoleInfo | null>(null);

  const load = useCallback(() => {
    api<RolesResponse>("/api/roles")
      .then((d) => {
        setRoles(d.roles);
        setAllKeys(d.allKeys);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const togglePermission = async (role: RoleInfo, key: PermissionKey) => {
    const has = role.permissions.includes(key);
    const next = has ? role.permissions.filter((p) => p !== key) : [...role.permissions, key];
    // Optimistic update; reconcile with the server response.
    setRoles((rs) => rs.map((r) => (r.id === role.id ? { ...r, permissions: next } : r)));
    try {
      const updated = await api<RoleInfo>(`/api/roles/${role.id}`, {
        method: "PATCH",
        body: JSON.stringify({ permissions: next }),
      });
      setRoles((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e) {
      setError((e as Error).message);
      load(); // roll back to server truth
    }
  };

  const deleteRole = async (role: RoleInfo) => {
    setDeleting(null);
    try {
      await api<{ ok: boolean }>(`/api/roles/${role.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }} spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 600, flexGrow: 1 }}>
          Roles
        </Typography>
        <Button startIcon={<RefreshIcon />} onClick={load}>
          Refresh
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Add role
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Check which permissions each role grants. Changes apply immediately. Members are assigned
        roles from the Members page.
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
              <TableCell sx={{ minWidth: 200 }}>Permission</TableCell>
              {roles.map((role) => (
                <TableCell key={role.id} align="center" sx={{ minWidth: 110 }}>
                  <Stack alignItems="center" spacing={0.25}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {role.name}
                      </Typography>
                      <IconButton size="small" onClick={() => setRenaming(role)} sx={{ p: 0.25 }}>
                        <EditIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                      {role.isProtected ? (
                        <Tooltip title="Built-in role — cannot be deleted">
                          <LockIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                        </Tooltip>
                      ) : (
                        <IconButton size="small" onClick={() => setDeleting(role)} sx={{ p: 0.25 }}>
                          <DeleteIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {role.memberCount} member{role.memberCount === 1 ? "" : "s"}
                    </Typography>
                  </Stack>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {allKeys.map((key) => (
              <TableRow key={key} hover>
                <TableCell>
                  <Typography variant="body2">{PERMISSION_LABELS[key] ?? key}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                    {key}
                  </Typography>
                </TableCell>
                {roles.map((role) => {
                  const ownerLocked = role.id === "owner" && OWNER_LOCKED.includes(key);
                  const selfLocked =
                    me?.role === role.id && key === "manage_roles" && role.permissions.includes(key);
                  const locked = ownerLocked || selfLocked;
                  return (
                    <TableCell key={role.id} align="center">
                      <Tooltip
                        title={
                          ownerLocked
                            ? "The owner role always keeps this"
                            : selfLocked
                              ? "You cannot remove this from your own role"
                              : ""
                        }
                      >
                        <span>
                          <Checkbox
                            size="small"
                            checked={role.permissions.includes(key)}
                            disabled={locked}
                            onChange={() => togglePermission(role, key)}
                          />
                        </span>
                      </Tooltip>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <CreateRoleDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
        onError={setError}
      />

      <RenameRoleDialog
        role={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={() => {
          setRenaming(null);
          load();
        }}
        onError={setError}
      />

      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete role "{deleting?.name}"?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleting && deleting.memberCount > 0
              ? `${deleting.memberCount} member${deleting.memberCount === 1 ? "" : "s"} currently
                 hold${deleting.memberCount === 1 ? "s" : ""} this role and will become External.`
              : "No members currently hold this role."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleting && deleteRole(deleting)}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

function CreateRoleDialog({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const slug = id.trim().toLowerCase();
  const valid = /^[a-z][a-z0-9_-]{1,31}$/.test(slug) && name.trim().length > 0;

  const create = async () => {
    setSaving(true);
    try {
      await api("/api/roles", {
        method: "POST",
        body: JSON.stringify({ id: slug, name: name.trim(), permissions: [] }),
      });
      setId("");
      setName("");
      onCreated();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add role</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Display name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!id) {
                setId(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
              }
            }}
            fullWidth
            autoFocus
          />
          <TextField
            label="Identifier"
            value={id}
            onChange={(e) => setId(e.target.value)}
            helperText="Lowercase letters, digits, - and _. Cannot be changed later."
            fullWidth
          />
          <Box>
            <Typography variant="caption" color="text.secondary">
              The new role starts with no permissions — check them off in the matrix.
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={create} disabled={!valid || saving}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RenameRoleDialog({
  role,
  onClose,
  onRenamed,
  onError,
}: {
  role: RoleInfo | null;
  onClose: () => void;
  onRenamed: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role) setName(role.name);
  }, [role]);

  const rename = async () => {
    if (!role) return;
    setSaving(true);
    try {
      await api(`/api/roles/${role.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      onRenamed();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!role} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Rename role</DialogTitle>
      <DialogContent>
        <TextField
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          autoFocus
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={rename} disabled={!name.trim() || saving}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
