import {
  Box,
  Chip,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
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

interface Props {
  items: Submission[];
  /** Show the submitter column (admin monitor view). */
  showSubmitter?: boolean;
}

export function SubmissionsTable({ items, showSubmitter = false }: Props) {
  const columns = showSubmitter ? 6 : 5;
  return (
    <Paper variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Key</TableCell>
            <TableCell>Kind</TableCell>
            {showSubmitter && <TableCell>Submitter</TableCell>}
            <TableCell>Status</TableCell>
            <TableCell>Submitted</TableCell>
            <TableCell>Files</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns} align="center" sx={{ color: "text.secondary" }}>
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
              {showSubmitter && (
                <TableCell>
                  {s.submitterName}
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {s.submitterEmail}
                  </Typography>
                </TableCell>
              )}
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
                      <Typography key={f.filename} variant="caption" color="text.disabled">
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
  );
}
