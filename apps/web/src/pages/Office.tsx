import { AppBar, Avatar, Box, Container, IconButton, Stack, Toolbar, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import LogoutIcon from "@mui/icons-material/Logout";
import { useStore } from "../store";
import { getSocket } from "../socket";
import { RoomCard } from "../components/RoomCard";

export function Office() {
  const brand = useStore((s) => s.brand);
  const user = useStore((s) => s.user);
  const rooms = useStore((s) => s.rooms);
  const presence = useStore((s) => s.presence);
  const currentRoomId = useStore((s) => s.currentRoomId);
  const setCurrentRoomId = useStore((s) => s.setCurrentRoomId);

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  };

  const enterRoom = (roomId: string) => {
    getSocket().emit("presence:join", roomId);
    setCurrentRoomId(roomId);
  };

  return (
    <Box>
      <AppBar position="sticky" color="default">
        <Toolbar>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexGrow: 1 }}>
            {brand.logoUrl && (
              <Box component="img" src={brand.logoUrl} alt={brand.name} sx={{ height: 28 }} />
            )}
            <Typography variant="h6">{brand.name}</Typography>
          </Stack>
          {user && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <Avatar src={user.imageUrl} alt={user.name} sx={{ width: 32, height: 32 }}>
                {user.name.charAt(0)}
              </Avatar>
              <Typography variant="body2">{user.name}</Typography>
              <IconButton onClick={logout} aria-label="Log out" size="small">
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Grid container spacing={2}>
          {rooms.map((room) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={room.id}>
              <RoomCard
                room={room}
                users={presence[room.id] ?? []}
                isCurrent={currentRoomId === room.id}
                onEnterRoom={() => enterRoom(room.id)}
              />
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
