import { useEffect, useState } from "react";
import {
  Alert,
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
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import type { BotTokenCreated, BotTokenInfo } from "@atrium/shared";

const AVAILABLE_SCOPES = [
  "digest:write",
  "reminders:read",
  "reminders:write",
] as const;

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function AdminBotTokens() {
  const [tokens, setTokens] = useState<BotTokenInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [justCreated, setJustCreated] = useState<BotTokenCreated | null>(null);

  const load = () => {
    fetch("/api/bot-tokens", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ items: BotTokenInfo[] }>;
      })
      .then((d) => setTokens(d.items))
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Revoke this token? Any routine using it will stop working.")) return;
    const r = await fetch(`/api/bot-tokens/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) {
      alert(`Delete failed: ${r.status}`);
      return;
    }
    load();
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, flexGrow: 1 }}>
          Bot tokens
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenCreate(true)}
        >
          New token
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Issue a token for a scheduled routine or external script. The token is shown
        only once at creation — copy it into the routine's environment variables and
        revoke it here if it leaks.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Scopes</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Last used</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {tokens.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: "text.secondary" }}>
                  No bot tokens yet.
                </TableCell>
              </TableRow>
            )}
            {tokens.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{t.name}</TableCell>
                <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                  {t.scopes.join(", ")}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{formatWhen(t.createdAt)}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{formatWhen(t.lastUsedAt)}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => remove(t.id)} aria-label="Revoke">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <CreateTokenDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={(created) => {
          setOpenCreate(false);
          setJustCreated(created);
          load();
        }}
      />

      <RevealDialog token={justCreated} onClose={() => setJustCreated(null)} />
    </Container>
  );
}

interface CreateProps {
  open: boolean;
  onClose: () => void;
  onCreated: (created: BotTokenCreated) => void;
}

function CreateTokenDialog({ open, onClose, onCreated }: CreateProps) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["digest:write"]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setScopes(["digest:write"]);
      setErr(null);
    }
  }, [open]);

  const toggle = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const submit = async () => {
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    if (scopes.length === 0) {
      setErr("Pick at least one scope.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch("/api/bot-tokens", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const created = (await r.json()) as BotTokenCreated;
      onCreated(created);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>New bot token</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. daily-recap"
            autoFocus
            fullWidth
          />
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Scopes
            </Typography>
            {AVAILABLE_SCOPES.map((s) => (
              <FormControlLabel
                key={s}
                control={
                  <Checkbox
                    checked={scopes.includes(s)}
                    onChange={() => toggle(s)}
                    size="small"
                  />
                }
                label={<code style={{ fontSize: "0.85rem" }}>{s}</code>}
              />
            ))}
          </Box>
          {err && <Typography color="error">{err}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={submit} variant="contained" disabled={submitting}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface RevealProps {
  token: BotTokenCreated | null;
  onClose: () => void;
}

function RevealDialog({ token, onClose }: RevealProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (token) setCopied(false);
  }, [token]);

  const copy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={Boolean(token)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Copy this token now</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This is the only time you'll see the full token. Paste it into the routine's
          env and close this dialog.
        </Alert>
        {token && (
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              display: "flex",
              alignItems: "center",
              gap: 1,
              fontFamily: "monospace",
              fontSize: "0.85rem",
              wordBreak: "break-all",
            }}
          >
            <Box sx={{ flexGrow: 1 }}>{token.token}</Box>
            <IconButton onClick={copy} size="small" aria-label="Copy">
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Paper>
        )}
        {copied && (
          <Typography variant="caption" color="success.main" sx={{ mt: 1 }}>
            Copied to clipboard.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
