import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
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
import { useNavigate } from "react-router-dom";
import type { FundingGrant, FundingList, SubmissionResource } from "@atrium/shared";
import { AppShell } from "../components/AppShell";
import { FileDrop } from "../components/FileDrop";
import { ResourcePicker } from "../components/ResourcePicker";
import { AcknowledgmentsDialog } from "../components/AcknowledgmentsDialog";
import { PAPER_NEW_FILES, POSTER_FILES } from "../submission-slots";

type Kind = "paper" | "poster";

export function Submit() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>("paper");
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
  const [ackOpen, setAckOpen] = useState(false);
  const [funding, setFunding] = useState<FundingList>({ active: [], completed: [] });

  const set = (k: string) => (e: { target: { value: string } }) =>
    setFields((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    fetch("/api/funding", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { active: [], completed: [] }))
      .then((d: FundingList) => setFunding(d))
      .catch(() => {});
  }, []);

  const addGrant = (g: FundingGrant) => {
    setFundingNone(false);
    setFields((p) => {
      const cur = (p.funding ?? "").trim();
      const parts = cur ? cur.split(",").map((s) => s.trim()).filter(Boolean) : [];
      if (!parts.includes(g.grant)) parts.push(g.grant);
      return { ...p, funding: parts.join(", ") };
    });
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
    if (kind === "paper") fd.append("type", fields.type ?? "");
    if (kind === "poster") fd.append("doi", doiNone ? "none" : fields.doi ?? "");

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
      const r = await fetch("/api/submissions", { method: "POST", credentials: "include", body: fd });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      // Back to the hub — the new submission shows there with live delivery status.
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
            <Button variant="outlined" onClick={() => setAckOpen(true)}>
              Generate acknowledgments
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              Builds a LaTeX \section&#123;Acknowledgments&#125; block from your grants and resources.
            </Typography>
          </Box>
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
              Files
            </Typography>
          </Divider>
          {slots.map((slot) => (
            <FileDrop
              key={slot.role}
              slot={slot}
              file={files[slot.role] ?? null}
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
            label="This is the accepted version and I have the right to share these files publicly. *"
          />

          <Button variant="contained" size="large" disabled={busy} onClick={submit}>
            {busy ? "Submitting…" : kind === "poster" ? "Submit poster" : "Submit new paper"}
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
                      {funding[bucket].map((g) => (
                        <TableRow
                          key={g.grant + g.project}
                          hover
                          sx={{ cursor: "pointer" }}
                          onClick={() => addGrant(g)}
                        >
                          <TableCell sx={{ fontWeight: 500 }}>{g.project}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
                            {g.grant}
                          </TableCell>
                          <TableCell>{g.agency}</TableCell>
                          <TableCell sx={{ color: "text.secondary", fontSize: "0.8rem" }}>
                            {g.title}
                          </TableCell>
                        </TableRow>
                      ))}
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
            <Button onClick={() => setFundingOpen(false)}>Done</Button>
          </DialogActions>
        </Dialog>

        <AcknowledgmentsDialog
          open={ackOpen}
          onClose={() => setAckOpen(false)}
          funding={fundingNone ? "" : fields.funding ?? ""}
          resources={resources}
        />
      </Container>
    </AppShell>
  );
}
