import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  CircularProgress,
  Container,
  IconButton,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LinkIcon from "@mui/icons-material/Link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Digest, DigestSummary } from "@atrium/shared";
import { AppShell } from "../../components/AppShell";
import { useStore } from "../../store";

function adjacentDates(list: DigestSummary[], current: string): { prev?: string; next?: string } {
  // list is descending. Previous (older) is at idx+1; next (newer) is at idx-1.
  const idx = list.findIndex((d) => d.date === current);
  if (idx === -1) return {};
  return {
    prev: list[idx + 1]?.date,
    next: list[idx - 1]?.date,
  };
}

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function DigestDay() {
  const { date } = useParams<{ date: string }>();
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get("t");
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const [digest, setDigest] = useState<Digest | null | "missing" | "forbidden">(null);
  const [index, setIndex] = useState<DigestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Share-link UI state (only for logged-in viewers; token comes from the API).
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [infoAnchor, setInfoAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setDigest(null);
    const url = urlToken
      ? `/api/digest/${date}?t=${encodeURIComponent(urlToken)}`
      : `/api/digest/${date}`;
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 404) return "missing" as const;
        if (r.status === 401) return "forbidden" as const;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Digest;
      })
      .then((d) => {
        if (cancelled) return;
        setDigest(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [date, urlToken]);

  useEffect(() => {
    // Day-list is only accessible to logged-in users; skip for anon share views.
    if (!user) {
      setIndex([]);
      return;
    }
    let cancelled = false;
    fetch("/api/digest?limit=100", { credentials: "include" })
      .then(async (r) => (r.ok ? (r.json() as Promise<{ items: DigestSummary[] }>) : { items: [] }))
      .then((d) => {
        if (!cancelled) setIndex(d.items);
      })
      .catch(() => {
        if (!cancelled) setIndex([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const nav = index && date ? adjacentDates(index, date) : {};
  const shareUrl =
    typeof digest === "object" && digest?.shareToken && date
      ? `${window.location.origin}/digest/${date}?t=${digest.shareToken}`
      : null;

  async function onCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard denied — do nothing, the field is still visible to copy by hand.
    }
  }

  return (
    <AppShell>
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2, gap: 1, flexWrap: "wrap" }}>
          {user && (
            <Button
              startIcon={<ArrowBackIcon />}
              size="small"
              onClick={() => navigate("/digest")}
            >
              All days
            </Button>
          )}
          <Box sx={{ flexGrow: 1 }} />
          {shareUrl && (
            <Button
              size="small"
              variant={shareOpen ? "contained" : "outlined"}
              startIcon={<LinkIcon />}
              onClick={() => setShareOpen((v) => !v)}
            >
              Share link
            </Button>
          )}
          {user && (
            <>
              <IconButton
                size="small"
                disabled={!nav.prev}
                onClick={() => nav.prev && navigate(`/digest/${nav.prev}`)}
                aria-label="Previous day"
              >
                <ChevronLeftIcon />
              </IconButton>
              <IconButton
                size="small"
                disabled={!nav.next}
                onClick={() => nav.next && navigate(`/digest/${nav.next}`)}
                aria-label="Next day"
              >
                <ChevronRightIcon />
              </IconButton>
            </>
          )}
        </Stack>

        {shareUrl && (
          <Collapse in={shareOpen} unmountOnExit>
            <Box
              sx={{
                mb: 2,
                p: 1.5,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: (t) => (t.palette.mode === "dark" ? "#1d1e28" : "#faf9fe"),
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Public permalink
                </Typography>
                <IconButton
                  size="small"
                  onClick={(e) => setInfoAnchor(e.currentTarget)}
                  aria-label="What is this?"
                >
                  <InfoOutlinedIcon fontSize="small" />
                </IconButton>
                <Popover
                  open={Boolean(infoAnchor)}
                  anchorEl={infoAnchor}
                  onClose={() => setInfoAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                  slotProps={{ paper: { sx: { maxWidth: 340, p: 1.5 } } }}
                >
                  <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                    Each digest has a random <b>share token</b> baked into its URL.
                    Anyone with this link can read this specific digest without
                    logging in — no other days, no other parts of Atrium.
                    <br />
                    <br />
                    Treat the link like a password: if it leaks publicly, anyone
                    who finds it can see this page. Not suitable for content you
                    wouldn&apos;t want on the open web.
                  </Typography>
                </Popover>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  value={shareUrl}
                  size="small"
                  fullWidth
                  InputProps={{ readOnly: true, sx: { fontFamily: "monospace", fontSize: 12 } }}
                  onFocus={(e) => e.target.select()}
                />
                <Tooltip title={copied ? "Copied!" : "Copy"} placement="top">
                  <IconButton size="small" onClick={onCopy} aria-label="Copy link">
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          </Collapse>
        )}

        {date && (
          <Typography variant="overline" color="text.secondary">
            {formatLong(date)}
          </Typography>
        )}

        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}

        {digest === null ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : digest === "missing" ? (
          <Typography color="text.secondary" sx={{ mt: 4 }}>
            No digest for {date}.
          </Typography>
        ) : digest === "forbidden" ? (
          <Stack alignItems="flex-start" spacing={2} sx={{ mt: 4 }}>
            <Typography color="text.secondary">
              This digest is private. Sign in to view, or open it using the share link.
            </Typography>
            <Button variant="contained" onClick={() => navigate("/")}>
              Sign in
            </Button>
          </Stack>
        ) : (
          <Box
            sx={{
              mt: 1,
              "& h1": { fontSize: "1.6rem", fontWeight: 600, mt: 2, mb: 1 },
              "& h2": { fontSize: "1.25rem", fontWeight: 600, mt: 2.5, mb: 1 },
              "& h3": { fontSize: "1.05rem", fontWeight: 600, mt: 2, mb: 0.5 },
              "& p":  { lineHeight: 1.65, my: 1 },
              "& ul, & ol": { pl: 3, my: 1 },
              "& li": { mb: 0.5 },
              "& a": { color: "primary.main" },
              "& code": {
                bgcolor: (t) => (t.palette.mode === "dark" ? "#272833" : "#f1eff7"),
                px: 0.5,
                borderRadius: 0.5,
                fontFamily: "monospace",
              },
              "& blockquote": {
                borderLeft: (t) => `3px solid ${t.palette.divider}`,
                pl: 1.5,
                color: "text.secondary",
                my: 1,
              },
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{digest.markdown}</ReactMarkdown>
          </Box>
        )}
      </Container>
    </AppShell>
  );
}
