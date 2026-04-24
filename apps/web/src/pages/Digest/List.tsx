import { useEffect, useState } from "react";
import {
  CircularProgress,
  Container,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import type { DigestSummary } from "@atrium/shared";
import { AppShell } from "../../components/AppShell";

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function agoSuffix(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function DigestList() {
  const [items, setItems] = useState<DigestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/digest?limit=60", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ items: DigestSummary[] }>;
      })
      .then((d) => {
        if (!cancelled) setItems(d.items);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell>
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
          Daily digest
        </Typography>

        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            Couldn't load digests: {error}
          </Typography>
        )}

        {items === null ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : items.length === 0 ? (
          <Typography color="text.secondary" sx={{ mt: 4, textAlign: "center" }}>
            No digest entries yet. Check back after the next run.
          </Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {items.map((d, idx) => (
                <ListItemButton
                  key={d.date}
                  component={RouterLink}
                  to={`/digest/${d.date}`}
                  divider={idx < items.length - 1}
                >
                  <ListItemText
                    primary={formatLong(d.date)}
                    primaryTypographyProps={{ fontWeight: 500 }}
                    secondary={`posted ${agoSuffix(d.createdAt)}`}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
      </Container>
    </AppShell>
  );
}
