import { useMemo } from "react";
import {
  AppBar,
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
import ChatIcon from "@mui/icons-material/Chat";
import type { PresenceUser, Room, User } from "@atrium/shared";
import { useStore } from "../store";
import { getSocket } from "../socket";
import { RoomCard } from "../components/RoomCard";
import { ChatPanel } from "../components/ChatPanel";
import { PingSnackbar } from "../components/PingSnackbar";
import { SettingsMenu } from "../components/SettingsMenu";
import { UserMenu } from "../components/UserMenu";
import { useNotifications } from "../hooks/useNotifications";
import { groupByZone, ZONES, type Zone } from "../layout";

interface Props {
  onViewMetrics?: () => void;
  onViewRooms?: () => void;
}

// Desktop floorplan: stacked zones. Offices go horizontal in their own row.
// Bottom row splits meetings (wider) from status (narrower).
const DESKTOP_AREAS = `
  "entry    entry"
  "research research"
  "offices  offices"
  "meetings status"
`;
const DESKTOP_COLUMNS = "2fr 1fr";

// Fixed column counts per zone, so rooms form consistent shapes
// regardless of viewport width.
const ZONE_COLUMNS: Record<string, { base: number; mobile: number }> = {
  entry: { base: 2, mobile: 2 },
  research: { base: 4, mobile: 2 },
  offices: { base: 5, mobile: 2 },
  meetings: { base: 4, mobile: 2 },
  status: { base: 3, mobile: 3 },
  other: { base: 4, mobile: 2 },
};

export function Office({ onViewMetrics, onViewRooms }: Props) {
  const brand = useStore((s) => s.brand);
  const user = useStore((s) => s.user);
  const rooms = useStore((s) => s.rooms);
  const presence = useStore((s) => s.presence);
  const currentRoomId = useStore((s) => s.currentRoomId);
  const setCurrentRoomId = useStore((s) => s.setCurrentRoomId);
  const chatOpen = useStore((s) => s.chatOpen);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const openDmWith = useStore((s) => s.openDmWith);
  useNotifications();

  const byZone = useMemo(() => groupByZone(rooms), [rooms]);

  const enterRoom = (roomId: string) => {
    getSocket().emit("presence:join", roomId);
    setCurrentRoomId(roomId);
  };

  const onDmUser = (target: PresenceUser | User) => {
    openDmWith({
      id: target.id,
      name: target.name,
      email: target.email,
      imageUrl: target.imageUrl,
    });
  };

  const zonesToRender: Zone[] = ZONES.map((z) => z.id).filter((z) => byZone[z].length > 0);
  if (byZone.other.length > 0) zonesToRender.push("other");

  const DRAWER_WIDTH = 360;

  return (
    <Box
      sx={{
        transition: (t) =>
          t.transitions.create("padding-right", {
            easing: chatOpen ? t.transitions.easing.easeOut : t.transitions.easing.sharp,
            duration: chatOpen ? t.transitions.duration.enteringScreen : t.transitions.duration.leavingScreen,
          }),
        pr: { xs: 0, md: chatOpen ? `${DRAWER_WIDTH}px` : 0 },
      }}
    >
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar variant="dense">
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexGrow: 1 }}>
            {brand.logoUrl && (
              <Box component="img" src={brand.logoUrl} alt={brand.name} sx={{ height: 24 }} />
            )}
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {brand.shortName ?? brand.name}
            </Typography>
          </Stack>
          {user && (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <IconButton onClick={() => setChatOpen(true)} aria-label="Open chat" size="small">
                <Badge color="secondary" variant="dot" invisible>
                  <ChatIcon />
                </Badge>
              </IconButton>
              {user.isAdmin && onViewRooms && <Button size="small" onClick={onViewRooms}>Rooms</Button>}
              {user.isAdmin && onViewMetrics && <Button size="small" onClick={onViewMetrics}>Metrics</Button>}
              <SettingsMenu />
              <UserMenu />
            </Stack>
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ py: 2, px: { xs: 1.5, md: 3 } }}>
        {rooms.length === 0 && (
          <Typography color="text.secondary" sx={{ mt: 6, textAlign: "center" }}>
            No rooms yet.{" "}
            {user?.isAdmin && onViewRooms && <Button onClick={onViewRooms}>Add one</Button>}
          </Typography>
        )}

        <Box
          sx={{
            display: "grid",
            gap: { xs: 2, md: 3 },
            alignItems: "start",
            gridTemplateAreas: { xs: "none", lg: DESKTOP_AREAS },
            gridTemplateColumns: { xs: "1fr", lg: DESKTOP_COLUMNS },
            gridAutoRows: { xs: "auto", lg: "min-content" },
          }}
        >
          {zonesToRender.map((zone) => (
            <ZoneBlock
              key={zone}
              zone={zone}
              rooms={byZone[zone]}
              presence={presence}
              currentRoomId={currentRoomId}
              onEnterRoom={enterRoom}
              onDmUser={onDmUser}
            />
          ))}
        </Box>
      </Container>

      <ChatPanel />
      <PingSnackbar />
    </Box>
  );
}

interface ZoneBlockProps {
  zone: Zone;
  rooms: Room[];
  presence: Record<string, PresenceUser[]>;
  currentRoomId: string | null;
  onEnterRoom: (roomId: string) => void;
  onDmUser: (u: PresenceUser) => void;
}

function ZoneBlock({ zone, rooms, presence, currentRoomId, onEnterRoom, onDmUser }: ZoneBlockProps) {
  const zoneDef = ZONES.find((z) => z.id === zone) ?? { id: zone, label: "Other" };
  const color = rooms[0]?.color;
  const cols = ZONE_COLUMNS[zone] ?? ZONE_COLUMNS.other!;
  return (
    <Box sx={{ gridArea: { lg: zone === "other" ? "auto" : zone } }}>
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 0.75 }}>
        {color && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} />}
        <Typography
          variant="overline"
          sx={{ letterSpacing: 1.5, color: "text.secondary", lineHeight: 1 }}
        >
          {zoneDef.label}
        </Typography>
        <Divider sx={{ flexGrow: 1 }} />
      </Stack>
      <Box
        sx={{
          display: "grid",
          gap: 1,
          gridTemplateColumns: {
            xs: `repeat(${cols.mobile}, 1fr)`,
            md: `repeat(${cols.base}, 1fr)`,
          },
        }}
      >
        {rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            users={presence[room.id] ?? []}
            isCurrent={currentRoomId === room.id}
            onEnterRoom={() => onEnterRoom(room.id)}
            onDmUser={onDmUser}
          />
        ))}
      </Box>
    </Box>
  );
}
