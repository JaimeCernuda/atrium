import { Box, Button, Stack, Tooltip, Typography } from "@mui/material";

export function UnlinkedZulipFallback({
  onConnect,
  onOpenZulip,
}: {
  onConnect: () => void;
  onOpenZulip: () => void;
}) {
  return (
    <Box
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 300,
      }}
    >
      <Stack spacing={2} sx={{ maxWidth: 320 }}>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
          Zulip isn't connected yet. Pick a way in:
        </Typography>
        <Button variant="contained" onClick={onConnect}>
          Connect Zulip
        </Button>
        <Tooltip title="Opens grc.zulipchat.com in a new tab; your browser session handles sign-in.">
          <Button variant="outlined" onClick={onOpenZulip}>
            Open Zulip
          </Button>
        </Tooltip>
      </Stack>
    </Box>
  );
}
