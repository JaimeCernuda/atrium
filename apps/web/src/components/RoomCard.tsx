import {
  Avatar,
  AvatarGroup,
  Badge,
  Box,
  Card,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import HeadsetMicIcon from "@mui/icons-material/HeadsetMic";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import VideocamIcon from "@mui/icons-material/Videocam";
import CheckIcon from "@mui/icons-material/Check";
import DoorbellIcon from "@mui/icons-material/Doorbell";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { useStore } from "../store";
import { useState } from "react";
import type { PresenceUser, Room } from "@atrium/shared";
import { getSocket } from "../socket";

interface Props {
  room: Room;
  users: PresenceUser[];
  isCurrent: boolean;
  onEnterRoom: () => void;
  onDmUser: (user: PresenceUser) => void;
}

export function RoomCard({ room, users, isCurrent, onEnterRoom, onDmUser }: Props) {
  const [menuState, setMenuState] = useState<{ anchor: HTMLElement; user: PresenceUser } | null>(null);
  const me = useStore((s) => s.user);
  const setRooms = useStore((s) => s.setRooms);
  const rooms = useStore((s) => s.rooms);

  const isOwner = !!me?.email && room.ownerEmail === me.email;
  const locked = !!room.locked;
  const canEnter = !locked || isOwner;

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

  const pingUser = (userId: string) => {
    getSocket().emit("ping:send", userId);
    setMenuState(null);
  };

  const knock = () => {
    getSocket().emit("knock:send", room.id);
  };

  const canKnock = users.length > 0 && !isCurrent && !room.disableMeeting;

  const toggleLock = async () => {
    const res = await fetch(`/api/rooms/${room.id}/lock`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: !locked }),
    });
    if (!res.ok) return;
    const updated = (await res.json()) as Room;
    setRooms(rooms.map((r) => (r.id === updated.id ? updated : r)));
  };

  return (
    <Card
      variant="outlined"
      sx={{
        borderLeft: room.color ? `4px solid ${room.color}` : undefined,
        borderRadius: 1.5,
        outline: isCurrent ? `2px solid` : "none",
        outlineColor: "primary.main",
        p: 1,
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        "&:hover": { boxShadow: 2 },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
          {locked && !isOwner && (
            <Tooltip title="Locked — knock to get the owner's attention">
              <LockIcon fontSize="small" sx={{ color: "text.secondary" }} />
            </Tooltip>
          )}
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {room.name}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0}>
          {isOwner && (
            <Tooltip title={locked ? "Unlock office" : "Lock office (only you can enter; others must knock)"}>
              <IconButton size="small" onClick={toggleLock} color={locked ? "warning" : "default"}>
                {locked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          {canKnock && (
            <Tooltip title="Knock — notify everyone in this room">
              <IconButton size="small" onClick={knock}>
                <DoorbellIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={isCurrent ? "You're here" : canEnter ? "Enter room" : "Locked"}>
            <span>
              <IconButton size="small" onClick={onEnterRoom} disabled={isCurrent || !canEnter}>
                {isCurrent ? (
                  <CheckIcon fontSize="small" />
                ) : !canEnter ? (
                  <LockIcon fontSize="small" />
                ) : (
                  <MeetingRoomIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
          {!room.disableMeeting && room.externalMeetUrl && (
            <Tooltip title="Enter meeting">
              <IconButton size="small" color="primary" onClick={openMeeting}>
                <VideocamIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      <Box
        sx={{
          minHeight: 30,
          mt: 0.75,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {users.length === 0 ? (
          <Typography variant="caption" color="text.disabled">empty</Typography>
        ) : (
          <AvatarGroup
            max={5}
            spacing="small"
            sx={{ "& .MuiAvatar-root": { width: 30, height: 30, fontSize: 13 } }}
          >
            {users.map((u) => (
              <Tooltip key={u.id} title={`${u.name}${u.inMeeting ? " · in meeting" : ""}`}>
                <Box
                  onClick={(e) => setMenuState({ anchor: e.currentTarget, user: u })}
                  sx={{
                    position: "relative",
                    cursor: "pointer",
                    width: 30,
                    height: 30,
                    display: "inline-block",
                  }}
                >
                  <Avatar
                    src={u.imageUrl}
                    alt={u.name}
                    sx={{
                      width: 30,
                      height: 30,
                      boxShadow: (t) =>
                        u.inMeeting
                          ? `0 0 0 2px ${t.palette.success.main}`
                          : "none",
                    }}
                  >
                    {u.name.charAt(0)}
                  </Avatar>
                  {u.inMeeting && (
                    <HeadsetMicIcon
                      sx={{
                        position: "absolute",
                        top: -6,
                        left: "50%",
                        transform: "translateX(-50%) rotate(-12deg)",
                        fontSize: 18,
                        color: "success.main",
                        filter: (t) =>
                          `drop-shadow(0 0 2px ${t.palette.background.paper})`,
                      }}
                    />
                  )}
                </Box>
              </Tooltip>
            ))}
          </AvatarGroup>
        )}
      </Box>

      <Menu anchorEl={menuState?.anchor} open={!!menuState} onClose={() => setMenuState(null)}>
        <MenuItem disabled>{menuState?.user.name}</MenuItem>
        <MenuItem onClick={() => menuState && pingUser(menuState.user.id)}>
          <NotificationsActiveIcon fontSize="small" sx={{ mr: 1 }} />
          Ping to talk
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuState) onDmUser(menuState.user);
            setMenuState(null);
          }}
        >
          <ChatBubbleOutlineIcon fontSize="small" sx={{ mr: 1 }} />
          Send message
        </MenuItem>
      </Menu>
    </Card>
  );
}
