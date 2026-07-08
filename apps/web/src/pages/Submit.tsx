import { useEffect, useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useNavigate } from "react-router-dom";
import type { FundingGrant, FundingList, Submission, SubmissionResource } from "@atrium/shared";
import { AppShell } from "../components/AppShell";
import { FileDrop } from "../components/FileDrop";
import { ResourcePicker } from "../components/ResourcePicker";
import { PAPER_NEW_FILES, POSTER_FILES } from "../submission-slots";

type Kind = "paper" | "poster";

export function Submit() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>("paper");
  const [prerelease, setPrerelease] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [resources, setResources] = useState<SubmissionResource[]>([]);
  const [fundingNone, setFundingNone] = useState(false);
  const [ghNone, setGhNone] = useState(false);
  const [doiNone, setDoiNone] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [funding, setFunding] = useState<FundingList>({ active: [], completed: [] });
  const [done, setDone] = useState<Submission | null>(null);

  const set = (k: string) => (e: { target: { value: string } }) =>
    setFields((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    fetch("/api/funding", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { active: [], completed: [] }))
      .then((d: FundingList) => setFunding(d))
      .catch(() => {});
  }, []);

  // Grants currently in the (comma-separated) funding field — drives the
  // "added" indicator in the picker so it's clear a click registered.
  const fundingParts = (fundingNone ? "" : fields.funding ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const selectedGrants = new Set(fundingParts);

  // Click toggles the grant in/out of the field, with a snackbar confirmation
  // (the field sits behind the dialog, so a click otherwise gives no feedback).
  const toggleGrant = (g: FundingGrant) => {
    setFundingNone(false);
    const has = selectedGrants.has(g.grant);
    setFields((p) => {
      const parts = (p.funding ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const next = has ? parts.filter((x) => x !== g.grant) : [...parts, g.grant];
      return { ...p, funding: next.join(", ") };
    });
    setSnack(`${has ? "Removed" : "Added"} ${g.project} (${g.grant})`);
  };

  const slots = kind === "poster" ? POSTER_FILES : PAPER_NEW_FILES;

  const submit = async () => {
    setError(null);
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("citation_key", fields.citation_key ?? "");
    fd.append("title", fields.title ?? "");
    fd.append("authors", fields.authors ?? "");
    fd.append("venue", fields.venue ?? "");
    fd.append("year", fields.year ?? "");
    fd.append("abstract", fields.abstract ?? "");
    fd.append("funding", fundingNone ? "none" : fields.funding ?? "");
    fd.append("resources", resources.join(","));
    fd.append("github_url", ghNone ? "none" : fields.github_url ?? "");
    fd.append("notes", fields.notes ?? "");
    fd.append("confirmation", confirm ? "true" : "false");
    fd.append("mode", prerelease ? "prerelease" : "full");
    if (kind === "paper") fd.append("type", fields.type ?? "");
    if (kind === "poster") fd.append("doi", doiNone ? "none" : fields.doi ?? "");

    // Pre-release: no files yet (the inputs are disabled). Otherwise enforce the
    // required-file set as before.
    if (!prerelease) {
      for (const slot of slots) {
        const f = files[slot.role];
        if (f) fd.append(slot.role, f, f.name);
        else if (slot.required) {
          setError(`Missing required file: ${slot.label}`);
          return;
        }
      }
    }

    setBusy(true);
    try {
      const r = await fetch("/api/submissions", { method: "POST", credentials: "include", body: fd });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      // Show the confirmation + website-PR guidance instead of navigating away.
      setDone((await r.json()) as Submission);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AppShell>
        <Container maxWidth="sm" sx={{ py: 4 }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            <AlertTitle>
              {prerelease ? "Pre-release notification sent" : "Submission received"}
            </AlertTitle>
            Your {done.kind} <strong>{done.title}</strong> was recorded.
          </Alert>
          <Alert severity="info" icon={false} sx={{ mb: 2 }}>
            A pull request is being opened on the public website (grc-iit/website). In a moment it
            appears as a linked <strong>PR</strong> chip next to this submission in{" "}
            <strong>My submissions</strong> — open it, review the entry, and once it looks right,{" "}
            <strong>ask an admin to merge it</strong> to publish.
          </Alert>
          {prerelease && (
            <Alert severity="warning" icon={false} sx={{ mb: 2 }}>
              You sent this as a <strong>pre-release notification</strong>, so no files were
              attached. Once the paper is published and you have the camera-ready PDF &amp; bib, come
              back to <strong>My submissions</strong> and click <strong>Update submission</strong> to
              attach them — the website entry updates automatically.
            </Alert>
          )}
          <Button variant="contained" onClick={() => navigate("/members/me/submissions")}>
            Go to My submissions
          </Button>
        </Container>
      </AppShell>
    );
  }

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
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
          New GRC submission
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Submit a published paper or poster. Files are archived and published to the lab site.
        </Typography>

        <ToggleButtonGroup
          exclusive
          fullWidth
          value={kind}
          onChange={(_e, v: Kind | null) => v && setKind(v)}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="paper">Paper</ToggleButton>
          <ToggleButton value="poster">Poster</ToggleButton>
        </ToggleButtonGroup>

        <Alert
          severity={prerelease ? "warning" : "info"}
          icon={false}
          sx={{ mb: 2 }}
          action={
            <Switch
              checked={prerelease}
              onChange={(e) => setPrerelease(e.target.checked)}
              inputProps={{ "aria-label": "pre-release notification" }}
            />
          }
        >
          <strong>Pre-release notification</strong> — the {kind} isn&apos;t published yet.
          {prerelease
            ? " File uploads are disabled; just fill in the details. You'll attach the camera-ready files later via Update submission."
            : " Turn this on to announce an accepted-but-unpublished paper without files."}
        </Alert>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={2}>
          <TextField
            label="Citation key"
            required
            value={fields.citation_key ?? ""}
            onChange={set("citation_key")}
            placeholder="kougkas2025iowarp"
            helperText="Matches your .bib key. Names every file. Recommended: surnameYearShortTitle (e.g. cernuda2024hstream). Letters, digits, _ : + -"
          />
          <TextField
            label={kind === "poster" ? "Poster title" : "Paper title"}
            required
            value={fields.title ?? ""}
            onChange={set("title")}
          />
          <TextField
            label="Authors"
            required
            value={fields.authors ?? ""}
            onChange={set("authors")}
            helperText="Publication order, comma-separated."
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Venue"
              required
              fullWidth
              value={fields.venue ?? ""}
              onChange={set("venue")}
            />
            <TextField
              label="Year"
              required
              type="number"
              sx={{ width: 120 }}
              value={fields.year ?? ""}
              onChange={set("year")}
            />
          </Stack>
          {kind === "paper" && (
            <TextField select label="Type" required value={fields.type ?? ""} onChange={set("type")}>
              {["Conference", "Journal", "Workshop", "Preprint"].map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Box>
            <TextField
              label="Funding"
              required
              fullWidth
              disabled={fundingNone}
              value={fundingNone ? "none" : fields.funding ?? ""}
              onChange={set("funding")}
              helperText="Comma-separated grant numbers / sources. Use the help icon to pick a lab grant."
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Look up GRC grant numbers">
                      <IconButton
                        edge="end"
                        size="small"
                        disabled={fundingNone}
                        onClick={() => setFundingOpen(true)}
                      >
                        <HelpOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={fundingNone}
                  onChange={(e) => setFundingNone(e.target.checked)}
                />
              }
              label="No specific funding"
            />
          </Box>
          <ResourcePicker selected={resources} onChange={setResources} />
          <Box>
            <TextField
              label="GitHub repo"
              required
              fullWidth
              disabled={ghNone}
              value={ghNone ? "none" : fields.github_url ?? ""}
              onChange={set("github_url")}
              placeholder="https://github.com/grc-iit/iowarp"
            />
            <FormControlLabel
              control={
                <Switch size="small" checked={ghNone} onChange={(e) => setGhNone(e.target.checked)} />
              }
              label="No public repo"
            />
          </Box>
          {kind === "poster" && (
            <Box>
              <TextField
                label="DOI (optional)"
                fullWidth
                disabled={doiNone}
                value={doiNone ? "none" : fields.doi ?? ""}
                onChange={set("doi")}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={doiNone}
                    onChange={(e) => setDoiNone(e.target.checked)}
                  />
                }
                label="No DOI for this poster"
              />
            </Box>
          )}
          <TextField
            label="Abstract"
            required
            multiline
            rows={3}
            value={fields.abstract ?? ""}
            onChange={set("abstract")}
          />

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">
              Files{prerelease ? " — not needed for a pre-release notification" : ""}
            </Typography>
          </Divider>
          {slots.map((slot) => (
            <FileDrop
              key={slot.role}
              slot={slot}
              file={files[slot.role] ?? null}
              disabled={prerelease}
              onPick={(f) => setFiles((p) => ({ ...p, [slot.role]: f }))}
            />
          ))}

          <TextField
            label="Notes to maintainer (optional)"
            multiline
            rows={2}
            value={fields.notes ?? ""}
            onChange={set("notes")}
          />

          <FormControlLabel
            control={<Switch checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />}
            label={
              prerelease
                ? "The details above are accurate. *"
                : "This is the accepted version and I have the right to share these files publicly. *"
            }
          />

          <Button variant="contained" size="large" disabled={busy} onClick={submit}>
            {busy
              ? "Submitting…"
              : prerelease
                ? "Send pre-release notification"
                : kind === "poster"
                  ? "Submit poster"
                  : "Submit new paper"}
          </Button>
        </Stack>

        <Dialog open={fundingOpen} onClose={() => setFundingOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>GRC funding — click a grant to add it</DialogTitle>
          <DialogContent>
            {(["active", "completed"] as const).map((bucket) =>
              funding[bucket].length === 0 ? null : (
                <Box key={bucket} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, textTransform: "capitalize" }}>
                    {bucket} ({funding[bucket].length})
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Project</TableCell>
                        <TableCell>Grant</TableCell>
                        <TableCell>Agency</TableCell>
                        <TableCell>Title</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {funding[bucket].map((g) => {
                        const added = selectedGrants.has(g.grant);
                        return (
                          <TableRow
                            key={g.grant + g.project}
                            hover
                            selected={added}
                            sx={{ cursor: "pointer" }}
                            onClick={() => toggleGrant(g)}
                          >
                            <TableCell sx={{ fontWeight: 500 }}>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                {added && <CheckCircleIcon color="success" fontSize="small" />}
                                <span>{g.project}</span>
                              </Stack>
                            </TableCell>
                            <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
                              {g.grant}
                            </TableCell>
                            <TableCell>{g.agency}</TableCell>
                            <TableCell sx={{ color: "text.secondary", fontSize: "0.8rem" }}>
                              {g.title}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
              ),
            )}
            <Typography variant="caption" color="text.secondary">
              Maintainer: edit <code>config/funding.json</code> to change this list.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Chip
              size="small"
              variant="outlined"
              label={`${selectedGrants.size} selected`}
              sx={{ mr: "auto" }}
            />
            <Button onClick={() => setFundingOpen(false)}>Done</Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={!!snack}
          autoHideDuration={2000}
          onClose={() => setSnack(null)}
          message={snack}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </Container>
    </AppShell>
  );
}
