import { useCallback, useEffect, useRef } from "react";
import {
  Badge,
  Box,
  Drawer,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../store";
import { clampDrawerWidth } from "../prefs";
import { MessageList, Composer, openZulip } from "./zulip/chatPrimitives";
import { ZulipDmView } from "./zulip/ZulipDmView";
import { UnlinkedZulipFallback } from "./UnlinkedZulipFallback";

export function ChatPanel() {
  const open = useStore((s) => s.chatOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const tab = useStore((s) => s.chatView);
  const setTab = useStore((s) => s.setChatView);
  const zulipLinked = useStore((s) => s.zulipLinked);
  const zulipSelfId = useStore((s) => s.zulipSelfId);
  const globalZulipChannelId = useStore((s) => s.globalZulipChannelId);
  const globalZulipTopicName = useStore((s) => s.globalZulipTopicName);
  const globalMessages = useStore((s) => s.globalMessages);
  const width = useStore((s) => s.chatPanelWidth);
  const setChatPanelWidth = useStore((s) => s.setChatPanelWidth);
  const unreadDms = useStore((s) => s.zulipUnreadDms);
  const unreadGlobal = useStore((s) => s.zulipUnreadGlobal);
  const removeZulipUnreadGlobal = useStore((s) => s.removeZulipUnreadGlobal);
  const setZulipViewState = useStore((s) => s.setZulipViewState);

  const dmUnreadCount = Object.keys(unreadDms).length;

  const onClose = () => setChatOpen(false);

  // The drawer hosts only the Global and DMs tabs.
  const drawerTab: "global" | "dm" = tab === "dm" || tab === "zulip-dm" ? "dm" : "global";

  // Mirror drawer open/closed into the composite view-state so unread gating
  // (Global + DMs live here) knows the surface is actually visible.
  useEffect(() => {
    setZulipViewState({ drawerOpen: open });
  }, [open, setZulipViewState]);

  // Mirror which drawer tab is showing. Switching to the DM list (no open
  // conversation) clears any active dm thread; ZulipDmView sets it on open.
  useEffect(() => {
    if (!open) {
      setZulipViewState({ chatView: null });
      return;
    }
    if (drawerTab === "global") {
      setZulipViewState({ chatView: "global", activeThread: null, activeThreadKey: null });
    } else {
      setZulipViewState({ chatView: "dm" });
    }
  }, [open, drawerTab, setZulipViewState]);

  // Viewing the Global tab clears its unread count for the aggregate header
  // badge. Runs when the drawer opens on Global and when the tab switches in.
  const onGlobal = open && drawerTab === "global";
  useEffect(() => {
    if (onGlobal) removeZulipUnreadGlobal();
  }, [onGlobal, removeZulipUnreadGlobal]);

  // Drag the drawer's left edge to resize. We track the drag at the document
  // level so the pointer can leave the 6px handle without dropping the gesture,
  // and persist the clamped width once on release.
  const dragging = useRef(false);
  const onResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // Drawer is anchored right: width grows as the pointer moves left.
      setChatPanelWidth(clampDrawerWidth(window.innerWidth - e.clientX));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [setChatPanelWidth]);

  // Both tabs are Zulip-only now. Global is Zulip-backed only when linked AND an
  // admin has mapped it to a channel+topic; otherwise we explain rather than
  // fall back to any internal chat.
  const globalIsMapped = globalZulipChannelId != null && globalZulipTopicName != null;
  const globalListMeId = zulipSelfId != null ? `zulip:${zulipSelfId}` : "";

  const sendGlobal = async (body: string) => {
    await fetch("/api/chat/global", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
  };

  const connectZulip = () => useStore.getState().setZulipLinkDialogOpen(true);

  const renderGlobal = () => {
    if (!zulipLinked) {
      return <UnlinkedZulipFallback onConnect={connectZulip} onOpenZulip={openZulip} />;
    }
    if (!globalIsMapped) {
      return (
        <Box sx={{ p: 3, flexGrow: 1, overflowY: "auto" }}>
          <Typography variant="body2" color="text.secondary">
            Global isn&apos;t mapped to a Zulip channel yet — an admin can set it
            under Admin → Global.
          </Typography>
        </Box>
      );
    }
    return (
      <>
        <MessageList messages={globalMessages} meId={globalListMeId} />
        <Composer onSend={sendGlobal} />
      </>
    );
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="persistent"
      PaperProps={{ sx: { width, overflow: "hidden" } }}
    >
      {/* Left-edge resize handle — drag to widen/narrow the drawer. */}
      <Box
        onMouseDown={onResizeDown}
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: "col-resize",
          zIndex: 2,
          "&:hover": { bgcolor: "action.hover" },
        }}
      />
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", pl: "6px" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1, pl: 2 }}>
          <Typography variant="h6">Chat</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
        <Tabs value={drawerTab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab
            value="global"
            label={
              <Badge
                color="secondary"
                badgeContent={unreadGlobal}
                invisible={unreadGlobal === 0}
                sx={{ "& .MuiBadge-badge": { right: -14, top: 2 } }}
              >
                Global
              </Badge>
            }
          />
          <Tab
            value="dm"
            label={
              <Badge
                color="secondary"
                badgeContent={dmUnreadCount}
                invisible={dmUnreadCount === 0}
                sx={{ "& .MuiBadge-badge": { right: -14, top: 2 } }}
              >
                DMs
              </Badge>
            }
          />
        </Tabs>

        {drawerTab === "dm" ? <ZulipDmView /> : renderGlobal()}
      </Box>
    </Drawer>
  );
}
