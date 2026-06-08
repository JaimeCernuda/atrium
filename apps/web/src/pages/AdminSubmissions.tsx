import { useEffect, useState } from "react";
import { Alert, Button, Container, Stack, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { Submission } from "@atrium/shared";
import { SubmissionsTable } from "../components/SubmissionsTable";

export function AdminSubmissions() {
  const [items, setItems] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);

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

      <SubmissionsTable items={items} showSubmitter />
    </Container>
  );
}
