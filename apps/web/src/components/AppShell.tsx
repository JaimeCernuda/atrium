import type { ReactNode } from "react";
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
import { can, useStore } from "../store";
import { SettingsMenu } from "./SettingsMenu";
import { UserMenu } from "./UserMenu";
import { ChatPanel } from "./ChatPanel";
import { PingSnackbar } from "./PingSnackbar";
import { AdminMenu } from "./AdminMenu";

const DRAWER_WIDTH = 360;

const TABS: Array<{ label: string; path: string; permission?: PermissionKey }> = [
  { label: "Office", path: "/" },
  { label: "Digest", path: "/digest" },
  { label: "Reminders", path: "/reminders" },
  { label: "Submit", path: "/submit", permission: "submit" },
];

function matchTab(pathname: string): string {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/digest")) return "/digest";
  if (pathname.startsWith("/reminders")) return "/reminders";
  if (pathname.startsWith("/submit")) return "/submit";
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

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = matchTab(location.pathname);

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
        pr: { xs: 0, md: chatOpen ? `${DRAWER_WIDTH}px` : 0 },
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
                label={t.label}
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
                  <Badge color="secondary" variant="dot" invisible>
                    <ChatIcon />
                  </Badge>
                </IconButton>
                <AdminMenu />
                <SettingsMenu />
                <UserMenu />
              </>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      {children}

      <ChatPanel />
      <PingSnackbar />
    </Box>
  );
}
