import { useMemo } from "react";
import { Box, Button, Container, Divider, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import type { PresenceUser, Room, User } from "@atrium/shared";
import { can, useStore } from "../store";
import { getSocket } from "../socket";
import { RoomCard } from "../components/RoomCard";
import { AppShell } from "../components/AppShell";
import { useNotifications } from "../hooks/useNotifications";
import { groupByZone, ZONES, type Zone } from "../layout";

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

export function Office() {
  const user = useStore((s) => s.user);
  const rooms = useStore((s) => s.rooms);
  const presence = useStore((s) => s.presence);
  const currentRoomId = useStore((s) => s.currentRoomId);
  const setCurrentRoomId = useStore((s) => s.setCurrentRoomId);
  const openDmWith = useStore((s) => s.openDmWith);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const setChatView = useStore((s) => s.setChatView);
  const setZulipActiveChannel = useStore((s) => s.setZulipActiveChannel);
  const navigate = useNavigate();
  useNotifications();

  const byZone = useMemo(() => groupByZone(rooms), [rooms]);

  const enterRoom = (roomId: string) => {
    getSocket().emit("presence:join", roomId);
    setCurrentRoomId(roomId);
    // If this spatial room is bound to a Zulip channel, surface it: open the
    // chat drawer on the Zulip tab focused on that channel (topic unselected).
    const room = rooms.find((r) => r.id === roomId);
    if (room?.zulipStreamId != null) {
      setChatView("zulip");
      setZulipActiveChannel(room.zulipStreamId, null);
      setChatOpen(true);
    }
  };

  const onDmUser = (target: PresenceUser | User) => {
    const s = useStore.getState();
    // When Zulip is linked, route DMs through Zulip (the unified DM surface).
    // Match the office user to a Zulip member by Atrium id or email.
    if (s.zulipLinked && s.zulipSelfId != null) {
      const zu = s.zulipUsers.find(
        (u) =>
          u.atriumUserId === target.id ||
          u.email.toLowerCase() === target.email.toLowerCase(),
      );
      if (zu) {
        s.setZulipActiveDmParticipants([s.zulipSelfId, zu.zulipUserId]);
        s.setChatView("zulip-dm");
        s.setChatOpen(true);
        return;
      }
      s.setZulipError("That person isn't in the Zulip org yet.");
    }
    openDmWith({
      id: target.id,
      name: target.name,
      email: target.email,
      imageUrl: target.imageUrl,
    });
  };

  const zonesToRender: Zone[] = ZONES.map((z) => z.id).filter((z) => byZone[z].length > 0);
  if (byZone.other.length > 0) zonesToRender.push("other");

  return (
    <AppShell>
      <Container maxWidth={false} sx={{ py: 2, px: { xs: 1.5, md: 3 } }}>
        {rooms.length === 0 && (
          <Typography color="text.secondary" sx={{ mt: 6, textAlign: "center" }}>
            No rooms yet.{" "}
            {can(user, "manage_rooms") && (
              <Button onClick={() => navigate("/admin/rooms")}>Add one</Button>
            )}
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
    </AppShell>
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
