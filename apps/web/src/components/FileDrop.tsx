import { useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import type { FileSlot } from "../submission-slots";

export function FileDrop({
  slot,
  file,
  onPick,
  disabled = false,
}: {
  slot: FileSlot;
  file: File | null;
  onPick: (f: File | null) => void;
  /** Greyed out and non-interactive (e.g. pre-release mode: no files yet). */
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        mb: 1,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
      aria-disabled={disabled}
    >
      <UploadFileIcon color={file ? "success" : "action"} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {slot.label}{" "}
          {disabled ? (
            <Box component="span" sx={{ color: "text.disabled" }}>
              — not needed yet
            </Box>
          ) : slot.required ? (
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
      <Button size="small" disabled={disabled} onClick={() => ref.current?.click()}>
        {file ? "Change" : "Browse"}
      </Button>
      <input
        ref={ref}
        type="file"
        accept={slot.accept}
        disabled={disabled}
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
