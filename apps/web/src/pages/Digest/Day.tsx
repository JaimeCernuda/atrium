import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate, useParams } from "react-router-dom";
import type { Digest, DigestSummary } from "@atrium/shared";
import { AppShell } from "../../components/AppShell";

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
  const navigate = useNavigate();
  const [digest, setDigest] = useState<Digest | null | "missing">(null);
  const [index, setIndex] = useState<DigestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setDigest(null);
    fetch(`/api/digest/${date}`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Digest>;
      })
      .then((d) => {
        if (cancelled) return;
        setDigest(d ?? "missing");
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
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
  }, []);

  const nav = index && date ? adjacentDates(index, date) : {};

  return (
    <AppShell>
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2, gap: 1 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            size="small"
            onClick={() => navigate("/digest")}
          >
            All days
          </Button>
          <Box sx={{ flexGrow: 1 }} />
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
        </Stack>

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
