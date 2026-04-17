import { useEffect, useState } from "react";
import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import WindowIcon from "@mui/icons-material/Window";
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

  const logoUrl = brand.logoUrl ?? "/brand/gnosis-logo.png";
  const bannerUrl = "/brand/gnosis-banner.jpg";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${bannerUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(2px)",
          transform: "scale(1.05)",
          zIndex: 0,
        },
        "&::after": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: (theme) =>
            theme.palette.mode === "dark"
              ? "linear-gradient(135deg, rgba(10,12,20,0.82) 0%, rgba(30,20,60,0.72) 50%, rgba(10,12,20,0.92) 100%)"
              : "linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(245,240,255,0.6) 50%, rgba(255,255,255,0.82) 100%)",
          zIndex: 0,
        },
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ position: "relative", zIndex: 1, width: "100%", minHeight: "100vh" }}
      >
        <Stack
          sx={{
            flex: 1,
            p: { xs: 4, md: 8 },
            justifyContent: "center",
            gap: 3,
            color: (theme) => (theme.palette.mode === "dark" ? "grey.100" : "grey.900"),
          }}
        >
          <Box
            component="img"
            src={logoUrl}
            alt={brand.name}
            sx={{ width: 80, height: 80, borderRadius: 2 }}
          />
          <Stack spacing={0.5}>
            <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
              Gnosis Research Center
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 400, opacity: 0.85 }}>
              Virtual Office
            </Typography>
          </Stack>
          <Typography variant="h6" sx={{ maxWidth: 480, fontWeight: 400, opacity: 0.75 }}>
            Drop into a room, see who&apos;s around, work, or start a conversation.
          </Typography>
        </Stack>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 4,
            width: { xs: "100%", md: 480 },
          }}
        >
          <Paper
            elevation={8}
            sx={{
              p: { xs: 3, sm: 5 },
              width: "100%",
              maxWidth: 400,
              borderRadius: 3,
              backdropFilter: "blur(12px)",
              background: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(30,30,40,0.85)"
                  : "rgba(255,255,255,0.9)",
            }}
          >
            <Stack spacing={3}>
              <Stack spacing={0.5}>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  Sign in
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Use your institutional account to continue.
                </Typography>
              </Stack>

              <Stack spacing={1.5}>
                {providers.google && (
                  <Button
                    variant="contained"
                    size="large"
                    href="/auth/google"
                    startIcon={<GoogleIcon />}
                    sx={{ justifyContent: "flex-start", py: 1.25 }}
                  >
                    Continue with Google
                  </Button>
                )}
                {providers.microsoft && (
                  <Button
                    variant="outlined"
                    size="large"
                    href="/auth/microsoft"
                    startIcon={<WindowIcon />}
                    sx={{ justifyContent: "flex-start", py: 1.25 }}
                  >
                    Continue with Microsoft
                  </Button>
                )}
              </Stack>

              <Divider />

              <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                Access restricted to approved domains. If you can&apos;t sign in, contact an admin.
              </Typography>
            </Stack>
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
}
