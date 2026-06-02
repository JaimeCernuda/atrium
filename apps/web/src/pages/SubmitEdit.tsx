import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Container,
  Divider,
  FormControlLabel,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useParams } from "react-router-dom";
import type { Submission } from "@atrium/shared";
import { AppShell } from "../components/AppShell";
import { FileDrop } from "../components/FileDrop";
import { CAMERA_READY_FILES, PAPER_EDIT_FILES } from "../submission-slots";

/**
 * Post-conference edit for one of your own paper submissions.
 * Pre-filled from the submission row — merges the published DOI, updated
 * citations, slides, and (optionally) a camera-ready version of the paper.
 */
export function SubmitEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (e: { target: { value: string } }) =>
    setFields((p) => ({ ...p, [k]: e.target.value }));

  // Load the submission being edited from the user's own list.
  useEffect(() => {
    fetch("/api/submissions/mine", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: Submission[] }) => {
        const found = d.items.find((s) => s.id === id && s.kind === "paper");
        if (!found) {
          setNotFound(true);
          return;
        }
        setSubmission(found);
        setFields({
          final_citation_key: found.citationKey,
          doi: found.doi && found.doi !== "none" ? found.doi : "",
          notes: "",
        });
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const slots = cameraReady ? [...PAPER_EDIT_FILES, ...CAMERA_READY_FILES] : PAPER_EDIT_FILES;

  const submit = async () => {
    if (!submission) return;
    setError(null);

    const fd = new FormData();
    fd.append("kind", "paper");
    fd.append("original_citation_key", submission.citationKey);
    fd.append("final_citation_key", fields.final_citation_key ?? "");
    fd.append("doi", fields.doi ?? "");
    fd.append("notes", fields.notes ?? "");

    for (const slot of slots) {
      const f = files[slot.role];
      if (f) fd.append(slot.role, f, f.name);
      else if (slot.required) {
        setError(`Missing required file: ${slot.label}`);
        return;
      }
    }

    setBusy(true);
    try {
      const r = await fetch("/api/submissions/edit", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      navigate("/members/me/submissions");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/members/me/submissions")}
          sx={{ mb: 1 }}
        >
          My submissions
        </Button>

        {notFound && (
          <Alert severity="error">
            Paper not found among your submissions. You can only edit your own paper submissions.
          </Alert>
        )}

        {!submission && !notFound && (
          <Stack spacing={2}>
            <Skeleton variant="text" width={300} height={40} />
            <Skeleton variant="rounded" height={300} />
          </Stack>
        )}

        {submission && (
          <>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
              Post-conference update
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Typography sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                {submission.citationKey}
              </Typography>
              {submission.stage === "edited" && (
                <Chip size="small" label="already updated once" variant="outlined" />
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {submission.title}
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Stack spacing={2}>
              <Alert severity="info">
                Brings the archived record up to the published version: final citation key, DOI,
                updated citations, and your presentation slides.
              </Alert>

              <TextField
                label="Final citation key"
                required
                value={fields.final_citation_key ?? ""}
                onChange={set("final_citation_key")}
                helperText="From the published .bib. Keep as-is if it didn't change — archived files are renamed automatically if it did."
              />
              <TextField
                label="DOI"
                required
                value={fields.doi ?? ""}
                onChange={set("doi")}
                placeholder="10.1145/3673038.3673150"
                helperText="Should match the DOI inside your updated .bib and .txt citations."
              />

              <Divider textAlign="left">
                <Typography variant="caption" color="text.secondary">
                  Updated files
                </Typography>
              </Divider>
              {PAPER_EDIT_FILES.map((slot) => (
                <FileDrop
                  key={slot.role}
                  slot={slot}
                  file={files[slot.role] ?? null}
                  onPick={(f) => setFiles((p) => ({ ...p, [slot.role]: f }))}
                />
              ))}

              <FormControlLabel
                control={
                  <Switch checked={cameraReady} onChange={(e) => setCameraReady(e.target.checked)} />
                }
                label="The camera-ready version changed from the accepted version"
              />
              {cameraReady && (
                <>
                  <Alert severity="info">
                    The files below replace the originally-submitted paper and source in the archive.
                  </Alert>
                  {CAMERA_READY_FILES.map((slot) => (
                    <FileDrop
                      key={slot.role}
                      slot={slot}
                      file={files[slot.role] ?? null}
                      onPick={(f) => setFiles((p) => ({ ...p, [slot.role]: f }))}
                    />
                  ))}
                </>
              )}

              <TextField
                label="Notes to maintainer (optional)"
                multiline
                rows={2}
                value={fields.notes ?? ""}
                onChange={set("notes")}
              />

              <Button variant="contained" size="large" disabled={busy} onClick={submit}>
                {busy ? "Submitting…" : "Submit update"}
              </Button>
            </Stack>
          </>
        )}
      </Container>
    </AppShell>
  );
}
