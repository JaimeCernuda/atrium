import { useMemo, useState } from "react";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import LogoutIcon from "@mui/icons-material/Logout";
import ChatIcon from "@mui/icons-material/Chat";
import type { PresenceUser, Room, User } from "@atrium/shared";
import { useStore } from "../store";
import { getSocket } from "../socket";
import { RoomCard } from "../components/RoomCard";
import { ChatPanel } from "../components/ChatPanel";
import { PingSnackbar } from "../components/PingSnackbar";

interface Props {
  onViewMetrics?: () => void;
  onViewRooms?: () => void;
}

function groupByCategory(rooms: Room[]): Array<{ category: string; color?: string; rooms: Room[] }> {
  const order: string[] = [];
  const groups: Record<string, { color?: string; rooms: Room[] }> = {};
  for (const r of rooms) {
    const key = r.category ?? "Other";
    if (!groups[key]) {
      groups[key] = { color: r.color, rooms: [] };
      order.push(key);
    }
    groups[key].rooms.push(r);
  }
  return order.map((category) => {
    const g = groups[category]!;
    return { category, color: g.color, rooms: g.rooms };
  });
}

export function Office({ onViewMetrics, onViewRooms }: Props) {
  const brand = useStore((s) => s.brand);
  const user = useStore((s) => s.user);
  const rooms = useStore((s) => s.rooms);
  const presence = useStore((s) => s.presence);
  const currentRoomId = useStore((s) => s.currentRoomId);
  const setCurrentRoomId = useStore((s) => s.setCurrentRoomId);
  const [chatOpen, setChatOpen] = useState(false);

  const grouped = useMemo(() => groupByCategory(rooms), [rooms]);

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  };

  const enterRoom = (roomId: string) => {
    getSocket().emit("presence:join", roomId);
    setCurrentRoomId(roomId);
  };

  const onDmUser = (_target: PresenceUser | User) => {
    setChatOpen(true);
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
              <IconButton onClick={() => setChatOpen(true)} aria-label="Open chat" size="small">
                <Badge color="secondary" variant="dot" invisible>
                  <ChatIcon />
                </Badge>
              </IconButton>
              {user.isAdmin && onViewRooms && <Button size="small" onClick={onViewRooms}>Rooms</Button>}
              {user.isAdmin && onViewMetrics && <Button size="small" onClick={onViewMetrics}>Metrics</Button>}
              <Avatar src={user.imageUrl} alt={user.name} sx={{ width: 32, height: 32 }}>
                {user.name.charAt(0)}
              </Avatar>
              <Typography variant="body2" sx={{ display: { xs: "none", sm: "block" } }}>
                {user.name}
              </Typography>
              <IconButton onClick={logout} aria-label="Log out" size="small">
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {grouped.length === 0 && (
          <Typography color="text.secondary" sx={{ mt: 4, textAlign: "center" }}>
            No rooms yet.{" "}
            {user?.isAdmin && onViewRooms && (
              <Button onClick={onViewRooms}>Add one</Button>
            )}
          </Typography>
        )}

        <Stack spacing={3}>
          {grouped.map(({ category, color, rooms: categoryRooms }) => (
            <Box key={category}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                {color && (
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color }} />
                )}
                <Typography variant="overline" sx={{ letterSpacing: 1.5, color: "text.secondary" }}>
                  {category}
                </Typography>
                <Divider sx={{ flexGrow: 1 }} />
              </Stack>
              <Grid container spacing={2}>
                {categoryRooms.map((room) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={room.id}>
                    <RoomCard
                      room={room}
                      users={presence[room.id] ?? []}
                      isCurrent={currentRoomId === room.id}
                      onEnterRoom={() => enterRoom(room.id)}
                      onDmUser={onDmUser}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          ))}
        </Stack>
      </Container>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      <PingSnackbar />
    </Box>
  );
}
