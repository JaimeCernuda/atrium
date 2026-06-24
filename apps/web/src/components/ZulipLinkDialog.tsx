import { useEffect, useState } from "react";
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
  TextField,
} from "@mui/material";
import type { ZulipLinkStatus } from "@atrium/shared";
import { useStore } from "../store";

const ZULIP_KEY_HELP = "https://grc.zulipchat.com/#settings/account-and-privacy";

/**
 * The Connect-Zulip dialog. Mounted ONCE at the app root (AppShell) and driven by
 * the zulipLinkDialogOpen store flag, so it can be opened from anywhere — the
 * avatar menu OR the unlinked Zulip/DM tab fallback — regardless of which menu is
 * open. The key is validated server-side, stored encrypted, never kept in the browser.
 */
export function ZulipLinkDialog() {
  const linked = useStore((s) => s.zulipLinked);
  const zulipEmail = useStore((s) => s.zulipEmail);
  const me = useStore((s) => s.user);
  const setZulipStatus = useStore((s) => s.setZulipStatus);
  const linking = useStore((s) => s.zulipLinking);
  const setLinking = useStore((s) => s.setZulipLinking);
  const open = useStore((s) => s.zulipLinkDialogOpen);
  const setOpen = useStore((s) => s.setZulipLinkDialogOpen);

  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setApiKey("");
      setEmail(zulipEmail ?? me?.email ?? "");
      setError(null);
    }
  }, [open, zulipEmail, me?.email]);

  const close = () => setOpen(false);

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
      close();
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
      close();
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>{linked ? "Zulip connection" : "Connect Zulip"}</DialogTitle>
      <DialogContent>
        {linked ? (
          <DialogContentText>
            Atrium is connected to Zulip as <strong>{zulipEmail}</strong>. Channels, topics, and
            messages flow through your own Zulip account.
          </DialogContentText>
        ) : (
          <DialogContentText component="div" sx={{ mb: 2 }}>
            Atrium talks to grc.zulipchat.com as you, using your personal Zulip API key. To get it:
            <Box component="ol" sx={{ mt: 1, mb: 0, pl: 2.5 }}>
              <li>
                Open{" "}
                <Link href={ZULIP_KEY_HELP} target="_blank" rel="noreferrer">
                  Zulip &rarr; Settings &rarr; Account &amp; privacy
                </Link>{" "}
                (or grc.zulipchat.com &rarr; gear &rarr; Personal settings).
              </li>
              <li>
                Under <strong>API key</strong>, click <strong>Show/Generate API key</strong> and copy
                it.
              </li>
              <li>Paste it below. It's validated, stored encrypted, and never shown again.</li>
            </Box>
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
            <Button onClick={close}>Close</Button>
            <Button color="error" onClick={disconnect} disabled={linking}>
              Disconnect
            </Button>
          </>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
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
  );
}
