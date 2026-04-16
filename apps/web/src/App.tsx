import { useMemo, useState } from "react";
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
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useStore } from "./store";
import { useBootstrap } from "./hooks/useBootstrap";
import { Login } from "./pages/Login";
import { Office } from "./pages/Office";
import { Metrics } from "./pages/Metrics";

type Route = "office" | "metrics";

export function App() {
  const { loading } = useBootstrap();
  const user = useStore((s) => s.user);
  const brand = useStore((s) => s.brand);
  const [route, setRoute] = useState<Route>("office");

  const theme = useMemo(
    () => createTheme({ palette: { primary: { main: brand.accentColor } } }),
    [brand.accentColor],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {loading ? (
        <Stack sx={{ minHeight: "100vh" }} alignItems="center" justifyContent="center">
          <CircularProgress />
        </Stack>
      ) : !user ? (
        <Login />
      ) : route === "metrics" ? (
        <Box>
          <AppBar position="sticky" color="default">
            <Toolbar>
              <Button startIcon={<ArrowBackIcon />} onClick={() => setRoute("office")}>
                Back to office
              </Button>
              <Typography variant="h6" sx={{ ml: 2 }}>
                {brand.name} — Metrics
              </Typography>
            </Toolbar>
          </AppBar>
          <Metrics />
        </Box>
      ) : (
        <Office onViewMetrics={user.isAdmin ? () => setRoute("metrics") : undefined} />
      )}
    </ThemeProvider>
  );
}
