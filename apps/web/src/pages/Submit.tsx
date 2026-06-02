import { useEffect, useRef, useState } from "react";
import {
  Alert,
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
  Link,
  MenuItem,
  Paper,
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
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import type { FundingGrant, FundingList, Submission } from "@atrium/shared";
import { AppShell } from "../components/AppShell";

type Kind = "paper" | "poster";
type Stage = "new" | "edit";

interface FileSlot {
  role: string;
  label: string;
  accept: string;
  required: boolean;
  help?: { title: string; img?: string; code?: string };
}

const EX_BIB = `@inproceedings{cernuda2024hstream,
  author    = {Jaime Cernuda and Jie Ye and Anthony Kougkas and Xian-He Sun},
  title     = {{HStream: A hierarchical data streaming engine for
               high-throughput scientific applications}},
  booktitle = {Proc. 53rd Int. Conf. on Parallel Processing (ICPP '24)},
  year      = {2024},
  pages     = {231--240}
}`;

const EX_BIB_DOI = `@inproceedings{cernuda2024hstream,
  author    = {Jaime Cernuda and Jie Ye and Anthony Kougkas and Xian-He Sun},
  title     = {{HStream: A hierarchical data streaming engine for
               high-throughput scientific applications}},
  booktitle = {Proc. 53rd Int. Conf. on Parallel Processing (ICPP '24)},
  year      = {2024},
  pages     = {231--240},
  doi       = {10.1145/3673038.3673150}
}`;

const EX_TXT = `J. Cernuda, J. Ye, A. Kougkas, and X.-H. Sun, "HStream: A
hierarchical data streaming engine for high-throughput scientific
applications," in Proc. 53rd Int. Conf. on Parallel Processing
(ICPP '24), 2024, pp. 231-240.`;

const PAPER_NEW_FILES: FileSlot[] = [
  { role: "pdf", label: "Paper PDF", accept: ".pdf", required: true },
  {
    role: "source",
    label: "LaTeX source (.zip)",
    accept: ".zip",
    required: true,
    help: { img: "/overleaf-zip.png", title: "Overleaf → File → Download as source (.zip)" },
  },
  {
    role: "bib",
    label: "Citation .bib (no DOI)",
    accept: ".bib",
    required: true,
    help: { title: "Example .bib (no DOI yet)", code: EX_BIB },
  },
  {
    role: "cite",
    label: "Citation, plain text (.txt)",
    accept: ".txt",
    required: true,
    help: { title: "Example plain-text citation", code: EX_TXT },
  },
];
const PAPER_EDIT_FILES: FileSlot[] = [
  {
    role: "bib",
    label: "Citation .bib (with DOI)",
    accept: ".bib",
    required: true,
    help: { title: "Example .bib (with DOI)", code: EX_BIB_DOI },
  },
  { role: "slides-pptx", label: "Slides (.pptx)", accept: ".pptx", required: true },
  { role: "slides-pdf", label: "Slides (.pdf)", accept: ".pdf", required: true },
];
const POSTER_FILES: FileSlot[] = [
  { role: "poster", label: "Poster (.pdf)", accept: ".pdf", required: true },
  { role: "abstract", label: "Extended abstract (.pdf)", accept: ".pdf", required: false },
  {
    role: "bib",
    label: "Citation .bib",
    accept: ".bib",
    required: true,
    help: { title: "Example .bib", code: EX_BIB },
  },
  {
    role: "cite",
    label: "Citation, plain text (.txt)",
    accept: ".txt",
    required: true,
    help: { title: "Example plain-text citation", code: EX_TXT },
  },
];

function FileDrop({
  slot,
  file,
  onPick,
}: {
  slot: FileSlot;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}
    >
      <UploadFileIcon color={file ? "success" : "action"} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {slot.label}{" "}
          {slot.required ? (
            <Box component="span" sx={{ color: "error.main" }}>
              *
            </Box>
          ) : (
            <Box component="span" sx={{ color: "text.disabled" }}>
              — optional
            </Box>
          )}
          {slot.help && (
            <Tooltip title="How to get this file">
              <IconButton size="small" sx={{ ml: 0.5 }} onClick={() => setHelpOpen(true)}>
                <HelpOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {file ? file.name : `${slot.accept} only`}
        </Typography>
      </Box>
      <Button size="small" onClick={() => ref.current?.click()}>
        {file ? "Change" : "Browse"}
      </Button>
      <input
        ref={ref}
        type="file"
        accept={slot.accept}
        style={{ display: "none" }}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {slot.help && (
        <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth={!!slot.help.code}>
          <DialogTitle>{slot.help.title}</DialogTitle>
          <DialogContent>
            {slot.help.img && (
              <Box
                component="img"
                src={slot.help.img}
                alt={slot.help.title}
                sx={{ width: "100%", borderRadius: 1, border: 1, borderColor: "divider" }}
              />
            )}
            {slot.help.code && (
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  bgcolor: "action.hover",
                  borderRadius: 1,
                  fontSize: "0.8rem",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {slot.help.code}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            {slot.help.code && (
              <Button onClick={() => navigator.clipboard.writeText(slot.help!.code!)}>Copy</Button>
            )}
            <Button onClick={() => setHelpOpen(false)}>Got it</Button>
          </DialogActions>
        </Dialog>
      )}
    </Paper>
  );
}

function statusColor(s: Submission["status"]): "default" | "info" | "success" | "error" {
  if (s === "delivered") return "success";
  if (s === "failed") return "error";
  if (s === "delivering") return "info";
  return "default";
}

export function Submit() {
  const [kind, setKind] = useState<Kind>("paper");
  const [stage, setStage] = useState<Stage>("new");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [fundingNone, setFundingNone] = useState(false);
  const [ghNone, setGhNone] = useState(false);
  const [doiNone, setDoiNone] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [mine, setMine] = useState<Submission[]>([]);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [funding, setFunding] = useState<FundingList>({ active: [], completed: [] });

  const set = (k: string) => (e: { target: { value: string } }) =>
    setFields((p) => ({ ...p, [k]: e.target.value }));

  const loadMine = () => {
    fetch("/api/submissions/mine", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: Submission[] }) => setMine(d.items))
      .catch(() => {});
  };
  useEffect(loadMine, []);

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

  const slots =
    kind === "poster" ? POSTER_FILES : stage === "edit" ? PAPER_EDIT_FILES : PAPER_NEW_FILES;

  const reset = () => {
    setFields({});
    setFiles({});
    setFundingNone(false);
    setGhNone(false);
    setDoiNone(false);
    setConfirm(false);
  };

  const submit = async () => {
    setError(null);
    setOkMsg(null);
    const fd = new FormData();
    const isEdit = kind === "paper" && stage === "edit";
    fd.append("kind", kind);

    if (isEdit) {
      fd.append("original_citation_key", fields.original_citation_key ?? "");
      fd.append("final_citation_key", fields.final_citation_key ?? "");
      fd.append("doi", fields.doi ?? "");
      fd.append("notes", fields.notes ?? "");
    } else {
      fd.append("citation_key", fields.citation_key ?? "");
      fd.append("title", fields.title ?? "");
      fd.append("authors", fields.authors ?? "");
      fd.append("venue", fields.venue ?? "");
      fd.append("year", fields.year ?? "");
      fd.append("abstract", fields.abstract ?? "");
      fd.append("funding", fundingNone ? "none" : fields.funding ?? "");
      fd.append("github_url", ghNone ? "none" : fields.github_url ?? "");
      fd.append("notes", fields.notes ?? "");
      fd.append("confirmation", confirm ? "true" : "false");
      if (kind === "paper") fd.append("type", fields.type ?? "");
      if (kind === "poster") fd.append("doi", doiNone ? "none" : fields.doi ?? "");
    }

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
      const url = isEdit ? "/api/submissions/edit" : "/api/submissions";
      const r = await fetch(url, { method: "POST", credentials: "include", body: fd });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setOkMsg("Submitted. Delivery to the public server runs shortly — watch the status below.");
      reset();
      loadMine();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isEdit = kind === "paper" && stage === "edit";

  return (
    <AppShell>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
          GRC submission
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Submit a published paper or poster. Files are archived and published to the lab site.
        </Typography>

        <ToggleButtonGroup
          exclusive
          fullWidth
          value={kind}
          onChange={(_e, v: Kind | null) => v && setKind(v)}
          sx={{ mb: 1.5 }}
        >
          <ToggleButton value="paper">Paper</ToggleButton>
          <ToggleButton value="poster">Poster</ToggleButton>
        </ToggleButtonGroup>

        {kind === "paper" && (
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={stage}
            onChange={(_e, v: Stage | null) => v && setStage(v)}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="new">New submission</ToggleButton>
            <ToggleButton value="edit">Post-conference edit</ToggleButton>
          </ToggleButtonGroup>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {okMsg && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {okMsg}
          </Alert>
        )}

        <Stack spacing={2}>
          {isEdit ? (
            <>
              <Alert severity="info">
                Merges into the paper you submitted at acceptance. The key may have changed at
                publication — give both.
              </Alert>
              <TextField
                label="Original citation key"
                required
                value={fields.original_citation_key ?? ""}
                onChange={set("original_citation_key")}
                helperText="From your acceptance submission."
              />
              <TextField
                label="Final citation key"
                required
                value={fields.final_citation_key ?? ""}
                onChange={set("final_citation_key")}
                helperText="From the published .bib. Same is fine."
              />
              <TextField
                label="DOI"
                required
                value={fields.doi ?? ""}
                onChange={set("doi")}
                helperText="Should match the DOI inside your updated .bib."
              />
            </>
          ) : (
            <>
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
                    <Switch
                      size="small"
                      checked={ghNone}
                      onChange={(e) => setGhNone(e.target.checked)}
                    />
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
            </>
          )}

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">
              {isEdit ? "Package 2 — files" : "Files"}
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

          {!isEdit && (
            <FormControlLabel
              control={<Switch checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />}
              label="This is the accepted version and I have the right to share these files publicly. *"
            />
          )}

          <Button variant="contained" size="large" disabled={busy} onClick={submit}>
            {busy
              ? "Submitting…"
              : isEdit
                ? "Submit update"
                : kind === "poster"
                  ? "Submit poster"
                  : "Submit new paper"}
          </Button>
        </Stack>

        {/* My submissions */}
        <Typography variant="h6" sx={{ fontWeight: 600, mt: 5, mb: 1 }}>
          My submissions
        </Typography>
        {mine.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing submitted yet.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {mine.map((s) => (
              <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                    {s.citationKey}
                  </Typography>
                  <Chip size="small" label={s.kind} />
                  <Chip
                    size="small"
                    color={statusColor(s.status)}
                    icon={s.status === "delivered" ? <CheckCircleIcon /> : undefined}
                    label={s.status}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {s.title}
                </Typography>
                {s.status === "failed" && s.deliveryLog && (
                  <Alert severity="error" sx={{ mb: 1 }}>
                    {s.deliveryLog}
                  </Alert>
                )}
                <Stack direction="row" spacing={1.5} flexWrap="wrap">
                  {s.files.map((f) =>
                    f.publicUrl ? (
                      <Link key={f.filename} href={f.publicUrl} target="_blank" rel="noreferrer">
                        {f.filename}
                      </Link>
                    ) : (
                      <Typography key={f.filename} variant="caption" color="text.disabled">
                        {f.filename} (pending)
                      </Typography>
                    ),
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}

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
      </Container>
    </AppShell>
  );
}
