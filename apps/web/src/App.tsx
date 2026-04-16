import { CircularProgress, CssBaseline, Stack, ThemeProvider, createTheme } from "@mui/material";
import { useMemo } from "react";
import { useStore } from "./store";
import { useBootstrap } from "./hooks/useBootstrap";
import { Login } from "./pages/Login";
import { Office } from "./pages/Office";

export function App() {
  const { loading } = useBootstrap();
  const user = useStore((s) => s.user);
  const brand = useStore((s) => s.brand);

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
      ) : user ? (
        <Office />
      ) : (
        <Login />
      )}
    </ThemeProvider>
  );
}
