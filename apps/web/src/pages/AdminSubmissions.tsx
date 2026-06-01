import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { Submission } from "@atrium/shared";

function statusColor(s: Submission["status"]): "default" | "info" | "success" | "error" {
  if (s === "delivered") return "success";
  if (s === "failed") return "error";
  if (s === "delivering") return "info";
  return "default";
}

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

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

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Key</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Submitter</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Submitted</TableCell>
              <TableCell>Files</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ color: "text.secondary" }}>
                  No submissions yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((s) => (
              <TableRow key={s.id} hover>
                <TableCell sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                  {s.citationKey}
                  {s.stage === "edited" && (
                    <Chip size="small" label="edited" sx={{ ml: 0.5 }} variant="outlined" />
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {s.title}
                  </Typography>
                </TableCell>
                <TableCell>{s.kind}</TableCell>
                <TableCell>
                  {s.submitterName}
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {s.submitterEmail}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip size="small" color={statusColor(s.status)} label={s.status} />
                  {s.status === "failed" && s.deliveryLog && (
                    <Typography variant="caption" color="error" sx={{ display: "block", maxWidth: 260 }}>
                      {s.deliveryLog}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{when(s.createdAt)}</TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", flexDirection: "column" }}>
                    {s.files.map((f) =>
                      f.publicUrl ? (
                        <Link
                          key={f.filename}
                          href={f.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          sx={{ fontSize: "0.8rem" }}
                        >
                          {f.filename}
                        </Link>
                      ) : (
                        <Typography
                          key={f.filename}
                          variant="caption"
                          color="text.disabled"
                        >
                          {f.filename}
                        </Typography>
                      ),
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Container>
  );
}
