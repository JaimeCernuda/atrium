import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Container,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
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
        Global chat
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Global chat posts to this Zulip channel and topic. Members read and write the
        Global tab and it flows straight into Zulip.
      </Typography>

      <Paper sx={{ p: 2 }}>
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
    </Container>
  );
}
