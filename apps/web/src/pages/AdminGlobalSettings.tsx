import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Container,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { GlobalChatConfig } from "@atrium/shared";
import { useStore } from "../store";
import { getSocket } from "../socket";

export function AdminGlobalSettings() {
  const channels = useStore((s) => s.zulipChannels);
  const setGlobalZulipConfig = useStore((s) => s.setGlobalZulipConfig);
  const [channelId, setChannelId] = useState<number | "">("");
  const [topicName, setTopicName] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reloading, setReloading] = useState(false);
  const [reloadMsg, setReloadMsg] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );

  const reloadChannels = async () => {
    setReloadMsg(null);
    setReloading(true);
    try {
      const res = await fetch("/api/admin/zulip/reload-cache", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setReloadMsg({ kind: "error", text: body?.error ?? `Reload failed: ${res.status}` });
        return;
      }
      // The server fans refreshed channels back over the socket; no manual
      // re-fetch needed. Nudge it anyway so a just-opened tab repaints promptly.
      getSocket().emit("zulip:fetch-channels");
      setReloadMsg({ kind: "success", text: "Channels, folders, and topics refreshed from Zulip." });
    } catch {
      setReloadMsg({ kind: "error", text: "Reload failed." });
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => {
    getSocket().emit("zulip:fetch-channels");
  }, []);

  useEffect(() => {
    fetch("/api/admin/global-settings", { credentials: "include" })
      .then((r) => r.json() as Promise<GlobalChatConfig>)
      .then((cfg) => {
        setChannelId(cfg.channelId ?? "");
        setTopicName(cfg.topicName ?? "");
      })
      .catch(console.error);
  }, []);

  const save = async () => {
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/global-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        channelId: channelId === "" ? null : channelId,
        topicName: topicName.trim() || null,
      }),
    });
    if (!res.ok) {
      setError(`Save failed: ${res.status}`);
      return;
    }
    const cfg = (await res.json()) as GlobalChatConfig;
    setGlobalZulipConfig(cfg.channelId, cfg.topicName);
    setChannelId(cfg.channelId ?? "");
    setTopicName(cfg.topicName ?? "");
    setSaved(true);
  };

  const configured = channelId !== "" && topicName.trim().length > 0;

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Typography variant="h4" sx={{ mb: 1 }}>
        Zulip
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Settings for the office&apos;s Zulip integration: the Global chat mapping and the
        cached channel list.
      </Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Global chat mapping
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Global chat posts to this Zulip channel and topic. Members read and write the
          Global tab and it flows straight into Zulip.
        </Typography>
        <Stack spacing={2}>
          {!configured && (
            <Alert severity="info">No global channel is set. Pick a channel and topic below.</Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {saved && <Alert severity="success">Global chat mapping saved.</Alert>}
          <TextField
            select
            label="Zulip channel"
            value={channelId === "" ? "" : channelId}
            onChange={(e) => setChannelId(e.target.value === "" ? "" : Number(e.target.value))}
            fullWidth
          >
            <MenuItem value="">(None)</MenuItem>
            {channels.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                #{c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Topic"
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            placeholder="general"
            fullWidth
          />
          <Button variant="contained" onClick={save} sx={{ alignSelf: "flex-start" }}>
            Save
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Channel cache
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Channels, folders, and topics are cached for 24 hours so they aren&apos;t refetched
          on every connect. Reload to pull the latest from Zulip now — handy after adding a
          channel or folder.
        </Typography>
        <Stack spacing={2}>
          {reloadMsg && <Alert severity={reloadMsg.kind}>{reloadMsg.text}</Alert>}
          <Button
            variant="outlined"
            onClick={reloadChannels}
            disabled={reloading}
            startIcon={reloading ? <CircularProgress size={16} /> : <RefreshIcon />}
            sx={{ alignSelf: "flex-start" }}
          >
            {reloading ? "Reloading…" : "Reload channels & topics"}
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
