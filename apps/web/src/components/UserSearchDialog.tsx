import { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import type { User } from "@atrium/shared";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (user: User) => void;
}

export function UserSearchDialog({ open, onClose, onPick }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = q.trim();
    if (trimmed.length === 0) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = window.setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`, {
        credentials: "include",
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((users: User[]) => setResults(users))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start a message</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: "text.secondary" }} /> }}
        />
        <Box sx={{ mt: 2, minHeight: 200 }}>
          {q.trim().length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Type a name or email to find teammates.
            </Typography>
          )}
          {q.trim().length > 0 && !loading && results.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              No matches for &ldquo;{q}&rdquo;.
            </Typography>
          )}
          <List>
            {results.map((u) => (
              <ListItemButton key={u.id} onClick={() => onPick(u)}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Avatar src={u.imageUrl} sx={{ width: 32, height: 32 }}>
                    {u.name.charAt(0)}
                  </Avatar>
                  <ListItemText primary={u.name} secondary={u.email} />
                </Stack>
              </ListItemButton>
            ))}
          </List>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
