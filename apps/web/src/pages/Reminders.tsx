import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import Tooltip from "@mui/material/Tooltip";
import type { Reminder, ReminderCategory } from "@atrium/shared";
import { AppShell } from "../components/AppShell";
import { useStore } from "../store";

const CATEGORY_COLORS: Record<ReminderCategory, string> = {
  deadline: "#d32f2f",
  event: "#1976d2",
  admin: "#7b1fa2",
  other: "#616161",
};

const CATEGORIES: ReminderCategory[] = ["deadline", "event", "admin", "other"];

function groupKey(dueAt: string, now: Date): "overdue" | "this-week" | "next-week" | "later" {
  const d = new Date(dueAt);
  if (d < now) return "overdue";
  const msInDay = 24 * 60 * 60 * 1000;
  const daysAway = Math.floor((d.getTime() - now.getTime()) / msInDay);
  if (daysAway < 7) return "this-week";
  if (daysAway < 14) return "next-week";
  return "later";
}

const GROUP_LABELS: Record<ReturnType<typeof groupKey>, string> = {
  overdue: "Past due",
  "this-week": "This week",
  "next-week": "Next week",
  later: "Later",
};

function formatDue(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function Reminders() {
  const user = useStore((s) => s.user);
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<
    { mode: "create" } | { mode: "edit"; reminder: Reminder } | null
  >(null);
  const [hideBots, setHideBots] = useState(false);

  const load = () => {
    fetch("/api/reminders?scope=upcoming", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ items: Reminder[] }>;
      })
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const visibleItems = useMemo(() => {
    if (!items) return null;
    return hideBots ? items.filter((r) => !r.createdByBot) : items;
  }, [items, hideBots]);

  const grouped = useMemo(() => {
    if (!visibleItems) return null;
    const now = new Date();
    const buckets: Record<ReturnType<typeof groupKey>, Reminder[]> = {
      overdue: [],
      "this-week": [],
      "next-week": [],
      later: [],
    };
    for (const r of visibleItems) buckets[groupKey(r.dueAt, now)].push(r);
    return buckets;
  }, [visibleItems]);

  const botCount = items?.filter((r) => r.createdByBot).length ?? 0;

  const onDelete = async (id: string) => {
    await fetch(`/api/reminders/${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  return (
    <AppShell>
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, flexGrow: 1 }}>
            Reminders
          </Typography>
          {botCount > 0 && (
            <Tooltip
              title={
                hideBots
                  ? `Showing only user reminders (${botCount} bot-posted hidden)`
                  : `Hide ${botCount} bot-posted reminder${botCount === 1 ? "" : "s"}`
              }
            >
              <IconButton
                size="small"
                onClick={() => setHideBots((v) => !v)}
                aria-label="Toggle bot reminders"
                color={hideBots ? "primary" : "default"}
              >
                {hideBots ? <FilterAltIcon /> : <FilterAltOffIcon />}
              </IconButton>
            </Tooltip>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogState({ mode: "create" })}
          >
            New
          </Button>
        </Stack>

        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}

        {grouped === null ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : items && items.length === 0 ? (
          <Typography color="text.secondary" sx={{ mt: 4, textAlign: "center" }}>
            Nothing upcoming. Post a new reminder to share with the team.
          </Typography>
        ) : (
          (["overdue", "this-week", "next-week", "later"] as const).map((key) => {
            const list = grouped[key] ?? [];
            if (list.length === 0) return null;
            return (
              <Box key={key} sx={{ mb: 3 }}>
                <Typography
                  variant="overline"
                  sx={{ color: "text.secondary", letterSpacing: 1.5 }}
                >
                  {GROUP_LABELS[key]}
                </Typography>
                <Stack spacing={1} sx={{ mt: 0.5 }}>
                  {list.map((r) => {
                    // Bot-posted reminders are community-maintained — any
                    // logged-in user can fix/delete them. User-posted are
                    // author-or-admin only.
                    const canMutate = Boolean(
                      user &&
                        (user.isAdmin ||
                          r.createdByBot ||
                          user.id === r.createdById),
                    );
                    return (
                      <ReminderRow
                        key={r.id}
                        reminder={r}
                        canMutate={canMutate}
                        onEdit={() => setDialogState({ mode: "edit", reminder: r })}
                        onDelete={() => onDelete(r.id)}
                      />
                    );
                  })}
                </Stack>
              </Box>
            );
          })
        )}

        <ReminderDialog
          state={dialogState}
          onClose={() => setDialogState(null)}
          onSaved={() => {
            setDialogState(null);
            load();
          }}
        />
      </Container>
    </AppShell>
  );
}

interface RowProps {
  reminder: Reminder;
  canMutate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function ReminderRow({ reminder, canMutate, onEdit, onDelete }: RowProps) {
  const color = CATEGORY_COLORS[reminder.category];
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
          {reminder.createdByBot && (
            <Tooltip title={`Posted by bot: ${reminder.createdByName}`}>
              <SmartToyIcon
                fontSize="small"
                sx={{ color: "text.secondary", flexShrink: 0 }}
              />
            </Tooltip>
          )}
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
            {reminder.title}
          </Typography>
          <Chip
            size="small"
            label={reminder.category}
            sx={{
              bgcolor: color,
              color: "#fff",
              textTransform: "capitalize",
              height: 18,
              fontSize: "0.7rem",
            }}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {formatDue(reminder.dueAt)} · by {reminder.createdByName}
          {reminder.createdByBot && " (bot)"}
        </Typography>
        {reminder.body && (
          <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: "pre-wrap" }}>
            {reminder.body}
          </Typography>
        )}
      </Box>
      {canMutate && (
        <Stack direction="row" spacing={0.25}>
          <IconButton size="small" onClick={onEdit} aria-label="Edit">
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onDelete} aria-label="Delete">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      )}
    </Paper>
  );
}

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; reminder: Reminder }
  | null;

interface DialogProps {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void;
}

function toLocalInputValue(iso: string): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time.
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function ReminderDialog({ state, onClose, onSaved }: DialogProps) {
  const mode = state?.mode ?? "create";
  const editing = state?.mode === "edit" ? state.reminder : null;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [category, setCategory] = useState<ReminderCategory>("deadline");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      const r = state.reminder;
      setTitle(r.title);
      setBody(r.body ?? "");
      setDueAt(toLocalInputValue(r.dueAt));
      setCategory(r.category);
    } else {
      setTitle("");
      setBody("");
      setDueAt("");
      setCategory("deadline");
    }
    setErr(null);
  }, [state]);

  const submit = async () => {
    if (!title.trim() || !dueAt) {
      setErr("Title and due date are required.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim() || null,
        dueAt: new Date(dueAt).toISOString(),
        category,
      };
      const url = editing ? `/api/reminders/${editing.id}` : "/api/reminders";
      const method = editing ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(state)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{mode === "edit" ? "Edit reminder" : "New reminder"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            fullWidth
          />
          <TextField
            label="Due"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Category"
            select
            value={category}
            onChange={(e) => setCategory(e.target.value as ReminderCategory)}
            fullWidth
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c} value={c} sx={{ textTransform: "capitalize" }}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Details (optional)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          {err && <Typography color="error">{err}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={submit} variant="contained" disabled={submitting}>
          {editing ? "Save" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
