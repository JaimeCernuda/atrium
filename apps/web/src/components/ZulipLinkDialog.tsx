import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  ListItemIcon,
  ListItemText,
  MenuItem,
  TextField,
} from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import type { ZulipLinkStatus } from "@atrium/shared";
import { useStore } from "../store";

const ZULIP_KEY_HELP = "https://grc.zulipchat.com/#settings/account-and-privacy";

/**
 * "Connect Zulip" flow. Mounted as a menu item in SettingsMenu. Sends the
 * pasted API key to POST /api/zulip/link, which validates and stores it
 * encrypted. The key never persists in the browser.
 */
export function ZulipLinkDialog() {
  const [open, setOpen] = useState(false);
  const linked = useStore((s) => s.zulipLinked);
  const zulipEmail = useStore((s) => s.zulipEmail);
  const me = useStore((s) => s.user);
  const setZulipStatus = useStore((s) => s.setZulipStatus);
  const linking = useStore((s) => s.zulipLinking);
  const setLinking = useStore((s) => s.setZulipLinking);

  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    setApiKey("");
    setEmail(zulipEmail ?? me?.email ?? "");
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    setError(null);
    setLinking(true);
    try {
      const res = await fetch("/api/zulip/link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), zulipEmail: email.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Connecting Zulip failed. Check the key and try again.");
        return;
      }
      const status = (await res.json()) as ZulipLinkStatus;
      setZulipStatus({ linked: status.linked, zulipEmail: status.zulipEmail });
      setApiKey("");
      setOpen(false);
    } catch {
      setError("Connecting Zulip failed. Check the connection and try again.");
    } finally {
      setLinking(false);
    }
  };

  const disconnect = async () => {
    setLinking(true);
    try {
      await fetch("/api/zulip/link", { method: "DELETE", credentials: "include" });
      setZulipStatus({ linked: false, zulipEmail: null });
      setOpen(false);
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      <MenuItem onClick={openDialog}>
        <ListItemIcon>
          <ChatBubbleOutlineIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary={linked ? "Zulip connected" : "Connect Zulip"}
          secondary={linked ? zulipEmail ?? undefined : "Bring channels into Atrium"}
          secondaryTypographyProps={{ variant: "caption" }}
        />
      </MenuItem>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{linked ? "Zulip connection" : "Connect Zulip"}</DialogTitle>
        <DialogContent>
          {linked ? (
            <DialogContentText>
              Atrium is connected to Zulip as <strong>{zulipEmail}</strong>. Channels, topics, and
              messages flow through your own Zulip account.
            </DialogContentText>
          ) : (
            <DialogContentText sx={{ mb: 2 }}>
              Atrium connects to grc.zulipchat.com as you, using your personal API key. Find it under{" "}
              <Link href={ZULIP_KEY_HELP} target="_blank" rel="noreferrer">
                Zulip Settings &rarr; Account &amp; privacy &rarr; API key
              </Link>
              . The key is validated, stored encrypted, and never shown again.
            </DialogContentText>
          )}

          {!linked && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
              <TextField
                label="Zulip email"
                size="small"
                fullWidth
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                helperText="Defaults to your Atrium email."
              />
              <TextField
                label="Zulip API key"
                size="small"
                fullWidth
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
              />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          {linked ? (
            <>
              <Button onClick={() => setOpen(false)}>Close</Button>
              <Button color="error" onClick={disconnect} disabled={linking}>
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                variant="contained"
                onClick={submit}
                disabled={linking || apiKey.trim().length === 0}
              >
                {linking ? "Connecting…" : "Connect"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
