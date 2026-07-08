import type { ReactNode } from "react";
import {
  Box,
  Chip,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
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
  /** Optional per-row actions (e.g. an Edit button on your own papers). */
  renderActions?: (s: Submission) => ReactNode;
}

function WebsiteCell({ s }: { s: Submission }) {
  const url = s.unpublishPrUrl ?? s.websitePrUrl;
  if (!url) {
    return (
      <Typography variant="caption" color="text.disabled">
        —
      </Typography>
    );
  }
  const label = s.unpublishPrUrl
    ? `unpublish #${s.websitePrNumber ?? ""}`
    : `PR #${s.websitePrNumber ?? ""}`;
  return (
    <Chip
      size="small"
      variant="outlined"
      color={s.unpublishPrUrl ? "warning" : "primary"}
      clickable
      component={Link}
      href={url}
      target="_blank"
      rel="noreferrer"
      label={`${label} ↗`}
    />
  );
}

export function SubmissionsTable({ items, showSubmitter = false, renderActions }: Props) {
  const columns = 6 + (showSubmitter ? 1 : 0) + (renderActions ? 1 : 0);
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: "100%", overflowX: "auto" }}>
      <Table size="small" sx={{ minWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>Key</TableCell>
            <TableCell>Kind</TableCell>
            {showSubmitter && <TableCell>Submitter</TableCell>}
            <TableCell>Status</TableCell>
            <TableCell>Submitted</TableCell>
            <TableCell>Files</TableCell>
            <TableCell>Website</TableCell>
            {renderActions && <TableCell align="right" />}
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
                {s.stage === "announced" && (
                  <Chip
                    size="small"
                    color="secondary"
                    label="pre-release"
                    sx={{ ml: 0.5 }}
                    variant="outlined"
                  />
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {s.title}
                </Typography>
                {s.resources.length > 0 && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                    {s.resources.map((r) => (
                      <Chip key={r} size="small" color="info" variant="outlined" label={r} />
                    ))}
                  </Box>
                )}
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
                {s.stage === "announced" ? (
                  // Pre-release: no files to deliver — success is the PR being open.
                  s.websitePrUrl ? (
                    <Chip size="small" color="info" variant="outlined" label="PR open — review & request merge" />
                  ) : (
                    <Chip size="small" label="opening PR…" />
                  )
                ) : (
                  <>
                    <Chip size="small" color={statusColor(s.status)} label={s.status} />
                    {s.status === "failed" && s.deliveryLog && (
                      <Typography
                        variant="caption"
                        color="error"
                        sx={{ display: "block", maxWidth: 260 }}
                      >
                        {s.deliveryLog}
                      </Typography>
                    )}
                  </>
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
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                <WebsiteCell s={s} />
              </TableCell>
              {renderActions && (
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  {renderActions(s)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
