import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useNavigate } from "react-router-dom";
import type { Submission } from "@atrium/shared";
import { SubmissionsTable } from "../components/SubmissionsTable";
import { can, useStore } from "../store";

export function AdminSubmissions() {
  const navigate = useNavigate();
  const me = useStore((s) => s.user);
  const canManage = can(me, "manage_submissions");
  const canEdit = can(me, "submit");
  const [items, setItems] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch("/api/submissions", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ items: Submission[] }>;
      })
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // live-ish refresh while delivery runs
    return () => clearInterval(t);
  }, []);

  const remove = async (mode: "cancel" | "delete") => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/submissions/${target.id}?mode=${mode}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setTarget(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, flexGrow: 1 }}>
          Submissions
        </Typography>
        <Button startIcon={<RefreshIcon />} onClick={load}>
          Refresh
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <SubmissionsTable
        items={items}
        showSubmitter
        renderActions={
          canEdit || canManage
            ? (s) => {
                if (s.status === "cancelling" || s.status === "cancelled") return null;
                const editable = s.kind === "paper" || s.stage === "announced";
                return (
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    {canEdit && editable && (
                      <Button
                        size="small"
                        startIcon={s.stage === "announced" ? <UploadFileIcon /> : <EditIcon />}
                        onClick={() => navigate(`/submit/edit/${s.id}`)}
                      >
                        {s.stage === "announced" ? "Add files" : "Edit"}
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteOutlineIcon />}
                        onClick={() => setTarget(s)}
                      >
                        Remove
                      </Button>
                    )}
                  </Stack>
                );
              }
            : undefined
        }
      />

      <Dialog open={!!target} onClose={() => !busy && setTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Remove submission</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            Removing <strong>{target?.citationKey}</strong> — {target?.title} will:
            <ul style={{ marginTop: 8, marginBottom: 8 }}>
              <li>delete the archived files from the server and from babbage;</li>
              <li>close its website pull request (or open an “unpublish” PR if already merged).</li>
            </ul>
            <strong>Withdraw</strong> keeps the record (marked cancelled) for audit.{" "}
            <strong>Delete permanently</strong> also purges the record once remote files are removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTarget(null)} disabled={busy}>
            Keep
          </Button>
          <Button onClick={() => remove("cancel")} disabled={busy} color="warning">
            Withdraw
          </Button>
          <Button onClick={() => remove("delete")} disabled={busy} color="error" variant="contained">
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
