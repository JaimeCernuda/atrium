import { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  CssBaseline,
  Stack,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
  lighten,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useStore } from "./store";
import { useBootstrap } from "./hooks/useBootstrap";
import { Login } from "./pages/Login";
import { Office } from "./pages/Office";
import { Metrics } from "./pages/Metrics";
import { AdminRooms } from "./pages/AdminRooms";
import { resolveMode } from "./prefs";

type Route = "office" | "metrics" | "rooms";

export function App() {
  const { loading } = useBootstrap();
  const user = useStore((s) => s.user);
  const brand = useStore((s) => s.brand);
  const themeMode = useStore((s) => s.prefs.themeMode);
  const [route, setRoute] = useState<Route>("office");
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
      ) : !user ? (
        <Login />
      ) : route === "office" ? (
        <Office
          onViewMetrics={user.isAdmin ? () => setRoute("metrics") : undefined}
          onViewRooms={user.isAdmin ? () => setRoute("rooms") : undefined}
        />
      ) : (
        <Box>
          <AppBar position="sticky" color="default">
            <Toolbar>
              <Button startIcon={<ArrowBackIcon />} onClick={() => setRoute("office")}>
                Back to office
              </Button>
              <Typography variant="h6" sx={{ ml: 2 }}>
                {brand.name} — {route === "metrics" ? "Metrics" : "Rooms"}
              </Typography>
            </Toolbar>
          </AppBar>
          {route === "metrics" && <Metrics />}
          {route === "rooms" && <AdminRooms />}
        </Box>
      )}
    </ThemeProvider>
  );
}
