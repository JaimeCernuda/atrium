import { useState } from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import TagIcon from "@mui/icons-material/Tag";
import ForumIcon from "@mui/icons-material/Forum";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { AppShell } from "../components/AppShell";
import { UnlinkedZulipFallback } from "../components/UnlinkedZulipFallback";
import { ZulipChannelView } from "../components/zulip/ZulipChannelView";
import { ZulipDmView } from "../components/zulip/ZulipDmView";
import { openZulip } from "../components/zulip/chatPrimitives";

type Pane = "channels" | "dms";

/**
 * Full-page Zulip client. A left rail switches the main pane between the
 * topic-first channel browser and the grouped direct-message surface; the wide
 * main area then hosts the selected channel's topics+messages or the selected
 * DM conversation. Both panes reuse the same store-backed views as the drawer,
 * so opening a channel still lazily loads its topics/history over the existing
 * socket events. When Zulip isn't linked, a centered Connect/Open prompt shows.
 */
export function Zulip() {
  const me = useStore((s) => s.user);
  const linked = useStore((s) => s.zulipLinked);
  // Office surfaces deep-link in: a DM click lands on the DMs pane, a Zulip-bound
  // room (or the nav item) lands on Channels.
  const [searchParams] = useSearchParams();
  const [pane, setPane] = useState<Pane>(
    searchParams.get("pane") === "dms" ? "dms" : "channels",
  );

  if (!linked) {
    return (
      <AppShell>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "calc(100vh - 48px)",
          }}
        >
          <UnlinkedZulipFallback
            onConnect={() => useStore.getState().setZulipLinkDialogOpen(true)}
            onOpenZulip={openZulip}
          />
        </Box>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Box
        sx={{
          display: "flex",
          height: "calc(100vh - 48px)",
          overflow: "hidden",
        }}
      >
        {/* Left rail: switch the main pane between Channels and Direct messages. */}
        <Paper
          square
          elevation={0}
          sx={{
            width: 220,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            display: { xs: "none", sm: "block" },
          }}
        >
          <Typography
            variant="overline"
            sx={{ px: 2, pt: 2, pb: 0.5, display: "block", color: "text.secondary" }}
          >
            Zulip
          </Typography>
          <List dense>
            <ListItemButton selected={pane === "channels"} onClick={() => setPane("channels")}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <TagIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Channels" />
            </ListItemButton>
            <ListItemButton selected={pane === "dms"} onClick={() => setPane("dms")}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <ForumIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Direct messages" />
            </ListItemButton>
          </List>
        </Paper>

        {/* Main area: the selected pane's full view. */}
        <Stack sx={{ flexGrow: 1, minWidth: 0, height: "100%" }}>
          {pane === "channels" ? (
            <ZulipChannelView meId={me?.id ?? ""} />
          ) : (
            <ZulipDmView />
          )}
        </Stack>
      </Box>
    </AppShell>
  );
}
