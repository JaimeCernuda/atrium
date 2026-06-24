import { useEffect, type ReactNode } from "react";
import {
  AppBar,
  Badge,
  Box,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import type { PermissionKey } from "@atrium/shared";
import { can, unreadChannelTotal, useStore } from "../store";
import { UserMenu } from "./UserMenu";
import { ZulipLinkDialog } from "./ZulipLinkDialog";
import { ChatPanel } from "./ChatPanel";
import { PingSnackbar } from "./PingSnackbar";
import { AdminMenu } from "./AdminMenu";
import { useZulipNotifications } from "../hooks/useZulipNotifications";
import { useZulipNotificationPermission } from "../hooks/useZulipNotificationPermission";

const TABS: Array<{ label: string; path: string; permission?: PermissionKey }> = [
  { label: "Office", path: "/" },
  { label: "Digest", path: "/digest" },
  { label: "Reminders", path: "/reminders" },
  { label: "Zulip", path: "/zulip" },
];

function matchTab(pathname: string): string {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/digest")) return "/digest";
  if (pathname.startsWith("/reminders")) return "/reminders";
  if (pathname.startsWith("/zulip")) return "/zulip";
  return "";
}

interface Props {
  children: ReactNode;
}

export function AppShell({ children }: Props) {
  const brand = useStore((s) => s.brand);
  const user = useStore((s) => s.user);
  const chatOpen = useStore((s) => s.chatOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const chatPanelWidth = useStore((s) => s.chatPanelWidth);
  // Aggregate header badge: unread channel topics + unread DM conversations +
  // unread Global messages. The channel total was previously missing, which is
  // why the bubble showed no number when only channels were unread.
  const unreadDmCount = useStore((s) => Object.keys(s.zulipUnreadDms).length);
  const unreadGlobal = useStore((s) => s.zulipUnreadGlobal);
  const unreadTopics = useStore((s) => s.zulipUnreadTopics);
  const channelTotal = unreadChannelTotal(unreadTopics);
  const totalUnread = channelTotal + unreadDmCount + unreadGlobal;
  const setZulipViewState = useStore((s) => s.setZulipViewState);

  // Browser notifications + sound + unread for live Zulip traffic, on every
  // authed page (this shell wraps them all; Login is outside it).
  useZulipNotifications();
  useZulipNotificationPermission();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = matchTab(location.pathname);

  // Track tab focus so unread gating only treats a thread as read when the tab
  // is actually visible.
  useEffect(() => {
    const onVisibility = () =>
      setZulipViewState({ tabFocused: document.visibilityState === "visible" });
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("blur", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("blur", onVisibility);
    };
  }, [setZulipViewState]);

  // Whether the full /zulip page is the active surface. Leaving it drops any
  // active channel thread so a backgrounded channel re-counts unread.
  useEffect(() => {
    const onZulipPage = activeTab === "/zulip";
    if (onZulipPage) {
      setZulipViewState({ zulipPageActive: true });
    } else {
      const v = useStore.getState().zulipViewState;
      setZulipViewState({
        zulipPageActive: false,
        ...(v.activeThread === "channel"
          ? { activeThread: null, activeThreadKey: null }
          : {}),
      });
    }
  }, [activeTab, setZulipViewState]);

  return (
    <Box
      sx={{
        transition: (t) =>
          t.transitions.create("padding-right", {
            easing: chatOpen ? t.transitions.easing.easeOut : t.transitions.easing.sharp,
            duration: chatOpen
              ? t.transitions.duration.enteringScreen
              : t.transitions.duration.leavingScreen,
          }),
        pr: { xs: 0, md: chatOpen ? `${chatPanelWidth}px` : 0 },
      }}
    >
      <AppBar
        position="sticky"
        color="default"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ flex: "1 1 0", minWidth: 0 }}
          >
            {brand.logoUrl && (
              <Box
                component="img"
                src={brand.logoUrl}
                alt={brand.name}
                sx={{ height: 24 }}
              />
            )}
            <Typography
              variant="subtitle1"
              noWrap
              sx={{ fontWeight: 600, display: { xs: "none", sm: "block" } }}
            >
              {brand.shortName ?? brand.name}
            </Typography>
          </Stack>

          <Tabs
            value={activeTab || false}
            onChange={(_e, v: string) => navigate(v)}
            variant={isMobile ? "scrollable" : "standard"}
            scrollButtons={false}
            textColor="primary"
            indicatorColor="primary"
            sx={{ minHeight: 40 }}
          >
            {TABS.filter((t) => !t.permission || can(user, t.permission)).map((t) => (
              <Tab
                key={t.path}
                value={t.path}
                label={
                  t.path === "/zulip" ? (
                    <Badge
                      color="secondary"
                      badgeContent={channelTotal}
                      invisible={channelTotal === 0}
                      sx={{ "& .MuiBadge-badge": { right: -12, top: 2 } }}
                    >
                      {t.label}
                    </Badge>
                  ) : (
                    t.label
                  )
                }
                component={RouterLink}
                to={t.path}
                sx={{ minHeight: 40, py: 0.5 }}
              />
            ))}
          </Tabs>

          <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            sx={{ flex: "1 1 0", justifyContent: "flex-end" }}
          >
            {user && (
              <>
                <IconButton
                  onClick={() => setChatOpen(true)}
                  aria-label="Open chat"
                  size="small"
                >
                  <Badge
                    color="secondary"
                    badgeContent={totalUnread}
                    invisible={totalUnread === 0}
                  >
                    <ChatIcon />
                  </Badge>
                </IconButton>
                <AdminMenu />
                <UserMenu />
              </>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      {children}

      <ChatPanel />
      <PingSnackbar />
      {/* Mounted at the root so "Connect Zulip" opens from anywhere (avatar menu OR
          the unlinked Zulip/DM tab), not just while the avatar menu is open. */}
      <ZulipLinkDialog />
    </Box>
  );
}
