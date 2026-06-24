import { Box, Stack } from "@mui/material";
import { useStore } from "../store";
import { AppShell } from "../components/AppShell";
import { UnlinkedZulipFallback } from "../components/UnlinkedZulipFallback";
import { ZulipChannelView } from "../components/zulip/ZulipChannelView";
import { openZulip } from "../components/zulip/chatPrimitives";

/**
 * Full-page Zulip client — channels only. Direct messages live in the right
 * chat drawer now; this page is the wide channel/topic surface. Opening a
 * channel lazily loads its topics + history over the existing socket events.
 * When Zulip isn't linked, a centered Connect/Open prompt shows.
 */
export function Zulip() {
  const me = useStore((s) => s.user);
  const linked = useStore((s) => s.zulipLinked);

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
        <Stack sx={{ flexGrow: 1, minWidth: 0, height: "100%" }}>
          <ZulipChannelView meId={me?.id ?? ""} />
        </Stack>
      </Box>
    </AppShell>
  );
}
