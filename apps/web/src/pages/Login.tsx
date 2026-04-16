import { useEffect, useState } from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { useStore } from "../store";

interface Providers {
  google: boolean;
  microsoft: boolean;
}

export function Login() {
  const brand = useStore((s) => s.brand);
  const [providers, setProviders] = useState<Providers>({ google: false, microsoft: false });

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((p) => setProviders(p as Providers))
      .catch(console.error);
  }, []);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
      }}
    >
      <Paper sx={{ p: 5, maxWidth: 420, width: "100%", textAlign: "center" }}>
        <Stack spacing={3}>
          {brand.logoUrl && (
            <Box component="img" src={brand.logoUrl} alt={brand.name} sx={{ maxHeight: 80, mx: "auto" }} />
          )}
          <Typography variant="h4">{brand.name}</Typography>
          <Typography variant="body1" color="text.secondary">
            Sign in to join your team in the office.
          </Typography>
          <Stack spacing={1}>
            {providers.google && (
              <Button variant="contained" size="large" href="/auth/google">
                Sign in with Google
              </Button>
            )}
            {providers.microsoft && (
              <Button variant="outlined" size="large" href="/auth/microsoft">
                Sign in with Microsoft
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
