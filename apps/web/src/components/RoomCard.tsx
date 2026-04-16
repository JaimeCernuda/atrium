import {
  Avatar,
  AvatarGroup,
  Button,
  Card,
  CardActions,
  CardContent,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { PresenceUser, Room } from "@atrium/shared";
import { getSocket } from "../socket";

interface Props {
  room: Room;
  users: PresenceUser[];
  isCurrent: boolean;
  onEnterRoom: () => void;
}

export function RoomCard({ room, users, isCurrent, onEnterRoom }: Props) {
  const openMeeting = () => {
    if (!room.externalMeetUrl) return;
    const socket = getSocket();
    socket.emit("presence:meeting-start");
    const w = window.open(room.externalMeetUrl, "_blank", "noopener,noreferrer");
    const poll = window.setInterval(() => {
      if (w?.closed) {
        socket.emit("presence:meeting-end");
        window.clearInterval(poll);
      }
    }, 1000);
  };

  return (
    <Card
      sx={{
        borderLeft: room.color ? `6px solid ${room.color}` : "none",
        outline: isCurrent ? "2px solid" : "none",
        outlineColor: "primary.main",
      }}
    >
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {room.name}
        </Typography>
        {users.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Empty
          </Typography>
        ) : (
          <AvatarGroup max={5}>
            {users.map((u) => (
              <Tooltip key={u.id} title={`${u.name}${u.inMeeting ? " (in meeting)" : ""}`}>
                <Avatar src={u.imageUrl} alt={u.name}>
                  {u.name.charAt(0)}
                </Avatar>
              </Tooltip>
            ))}
          </AvatarGroup>
        )}
      </CardContent>
      <CardActions>
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={onEnterRoom} disabled={isCurrent}>
            {isCurrent ? "You're here" : "Enter room"}
          </Button>
          {!room.disableMeeting && room.externalMeetUrl && (
            <Button size="small" color="primary" onClick={openMeeting}>
              Enter meeting
            </Button>
          )}
        </Stack>
      </CardActions>
    </Card>
  );
}
