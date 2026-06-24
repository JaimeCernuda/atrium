import { useEffect, useMemo, useState } from "react";
import {
  CircularProgress,
  CssBaseline,
  Stack,
  ThemeProvider,
  createTheme,
  lighten,
} from "@mui/material";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { can, useStore } from "./store";
import { useBootstrap } from "./hooks/useBootstrap";
import { Login } from "./pages/Login";
import { Office } from "./pages/Office";
import { Metrics } from "./pages/Metrics";
import { AdminRooms } from "./pages/AdminRooms";
import { AdminGlobalSettings } from "./pages/AdminGlobalSettings";
import { AdminUserGroupPolicy } from "./pages/AdminUserGroupPolicy";
import { AdminBotTokens } from "./pages/AdminBotTokens";
import { AdminRoles } from "./pages/AdminRoles";
import { AdminMembers } from "./pages/AdminMembers";
import { DigestList } from "./pages/Digest/List";
import { DigestDay } from "./pages/Digest/Day";
import { Reminders } from "./pages/Reminders";
import { Zulip } from "./pages/Zulip";
import { Submit } from "./pages/Submit";
import { SubmitEdit } from "./pages/SubmitEdit";
import { AdminSubmissions } from "./pages/AdminSubmissions";
import { MemberSubmissions } from "./pages/MemberSubmissions";
import { AppShell } from "./components/AppShell";
import { resolveMode } from "./prefs";

export function App() {
  const { loading } = useBootstrap();
  const user = useStore((s) => s.user);
  const brand = useStore((s) => s.brand);
  const themeMode = useStore((s) => s.prefs.themeMode);
  const [systemTick, setSystemTick] = useState(0);

  useEffect(() => {
    if (themeMode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTick((t) => t + 1);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [themeMode]);

  const theme = useMemo(() => {
    const mode = resolveMode(themeMode);
    const primary = mode === "dark" ? lighten(brand.accentColor, 0.45) : brand.accentColor;
    return createTheme({
      palette: {
        mode,
        primary: { main: primary },
        ...(mode === "light"
          ? {
              background: { default: "#f6f4f9", paper: "#ffffff" },
              text: { primary: "#1a1a22", secondary: "#55555f" },
              divider: "rgba(0, 0, 0, 0.08)",
            }
          : {
              background: { default: "#0f1017", paper: "#1a1b24" },
              text: { primary: "#e8e8ec", secondary: "#9a9aa3" },
              divider: "rgba(255, 255, 255, 0.08)",
            }),
      },
      shape: { borderRadius: 8 },
      typography: {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            // Theme-consistent scrollbars app-wide (light + dark). Firefox uses
            // scrollbar-color; WebKit/Blink use the ::-webkit-scrollbar pseudos.
            "*": {
              scrollbarWidth: "thin",
              scrollbarColor:
                mode === "dark"
                  ? "rgba(255,255,255,0.22) transparent"
                  : "rgba(0,0,0,0.26) transparent",
            },
            "*::-webkit-scrollbar": {
              width: 10,
              height: 10,
            },
            "*::-webkit-scrollbar-track": {
              backgroundColor: "transparent",
            },
            "*::-webkit-scrollbar-thumb": {
              borderRadius: 8,
              border: "2px solid transparent",
              backgroundClip: "content-box",
              backgroundColor:
                mode === "dark" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.26)",
            },
            "*::-webkit-scrollbar-thumb:hover": {
              backgroundColor:
                mode === "dark" ? "rgba(255,255,255,0.34)" : "rgba(0,0,0,0.40)",
            },
            "*::-webkit-scrollbar-corner": {
              backgroundColor: "transparent",
            },
          },
        },
        MuiAppBar: {
          styleOverrides: {
            colorDefault: ({ theme: t }) => ({
              backgroundColor: t.palette.background.paper,
              borderBottom: `1px solid ${t.palette.divider}`,
              boxShadow: "none",
            }),
          },
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.accentColor, themeMode, systemTick]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {loading ? (
        <Stack sx={{ minHeight: "100vh" }} alignItems="center" justifyContent="center">
          <CircularProgress />
        </Stack>
      ) : (
        <BrowserRouter>
          <Routes>
            {/* Public-capable: DigestDay works with a share token even when !user. */}
            <Route path="/digest/:date" element={<DigestDay />} />

            {!user ? (
              <Route path="*" element={<Login />} />
            ) : (
              <>
                <Route path="/" element={<Office />} />
                <Route path="/digest" element={<DigestList />} />
                <Route path="/reminders" element={<Reminders />} />
                <Route path="/zulip" element={<Zulip />} />
                {can(user, "submit") && <Route path="/submit" element={<Submit />} />}
                {can(user, "submit") && <Route path="/submit/edit/:id" element={<SubmitEdit />} />}
                <Route
                  path="/members/:id/submissions"
                  element={
                    <AppShell>
                      <MemberSubmissions />
                    </AppShell>
                  }
                />
                {can(user, "view_metrics") && (
                  <Route
                    path="/admin/metrics"
                    element={
                      <AppShell>
                        <Metrics />
                      </AppShell>
                    }
                  />
                )}
                {can(user, "manage_rooms") && (
                  <Route
                    path="/admin/rooms"
                    element={
                      <AppShell>
                        <AdminRooms />
                      </AppShell>
                    }
                  />
                )}
                {can(user, "manage_rooms") && (
                  <Route
                    path="/admin/zulip"
                    element={
                      <AppShell>
                        <AdminGlobalSettings />
                      </AppShell>
                    }
                  />
                )}
                {can(user, "manage_rooms") && (
                  // Back-compat: the old "Global chat" path still resolves.
                  <Route
                    path="/admin/global"
                    element={
                      <AppShell>
                        <AdminGlobalSettings />
                      </AppShell>
                    }
                  />
                )}
                {can(user, "manage_rooms") && (
                  <Route
                    path="/admin/user-groups"
                    element={
                      <AppShell>
                        <AdminUserGroupPolicy />
                      </AppShell>
                    }
                  />
                )}
                {can(user, "manage_bots") && (
                  <Route
                    path="/admin/bot-tokens"
                    element={
                      <AppShell>
                        <AdminBotTokens />
                      </AppShell>
                    }
                  />
                )}
                {can(user, "view_all_submissions") && (
                  <Route
                    path="/admin/submissions"
                    element={
                      <AppShell>
                        <AdminSubmissions />
                      </AppShell>
                    }
                  />
                )}
                {can(user, "manage_roles") && (
                  <Route
                    path="/admin/roles"
                    element={
                      <AppShell>
                        <AdminRoles />
                      </AppShell>
                    }
                  />
                )}
                {can(user, "manage_members") && (
                  <Route
                    path="/admin/members"
                    element={
                      <AppShell>
                        <AdminMembers />
                      </AppShell>
                    }
                  />
                )}
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            )}
          </Routes>
        </BrowserRouter>
      )}
    </ThemeProvider>
  );
}
