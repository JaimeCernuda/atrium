import { Alert, Avatar, Button, Snackbar, Stack, Typography } from "@mui/material";
import { useStore } from "../store";
import { getSocket } from "../socket";

export function PingSnackbar() {
  const active = useStore((s) => s.activePing);
  const setActivePing = useStore((s) => s.setActivePing);
  const setCurrentRoomId = useStore((s) => s.setCurrentRoomId);
  const rooms = useStore((s) => s.rooms);

  if (!active) return null;
  const roomName = rooms.find((r) => r.id === active.roomId)?.name;

  const accept = () => {
    if (active.roomId) {
      getSocket().emit("presence:join", active.roomId);
      setCurrentRoomId(active.roomId);
    }
    setActivePing(null);
  };

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      onClose={() => setActivePing(null)}
      autoHideDuration={30000}
    >
      <Alert severity="info" onClose={() => setActivePing(null)} sx={{ pr: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar src={active.from.imageUrl} sx={{ width: 28, height: 28 }}>
            {active.from.name.charAt(0)}
          </Avatar>
          <Stack>
            <Typography variant="body2">
              <strong>{active.from.name}</strong> pinged you
              {roomName ? ` from ${roomName}` : ""}
            </Typography>
            {active.roomId && (
              <Button size="small" onClick={accept} sx={{ alignSelf: "flex-start" }}>
                Join them
              </Button>
            )}
          </Stack>
        </Stack>
      </Alert>
    </Snackbar>
  );
}
