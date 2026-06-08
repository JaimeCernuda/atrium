import {
  Avatar,
  AvatarGroup,
  Badge,
  Box,
  Card,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ArticleIcon from "@mui/icons-material/Article";
import HeadsetMicIcon from "@mui/icons-material/HeadsetMic";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import VideocamIcon from "@mui/icons-material/Videocam";
import CheckIcon from "@mui/icons-material/Check";
import DoorbellIcon from "@mui/icons-material/Doorbell";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import PaletteIcon from "@mui/icons-material/Palette";
import { useNavigate } from "react-router-dom";
import { can, useStore } from "../store";
import { useState } from "react";
import type { PresenceUser, Room } from "@atrium/shared";
import { getSocket } from "../socket";
import { OfficeDecorateDialog } from "./OfficeDecorateDialog";
import { buildCardBg, buildBorderSx, LINK_ICON } from "./officeDecoUtils";

interface Props {
  room: Room;
  users: PresenceUser[];
  isCurrent: boolean;
  onEnterRoom: () => void;
  onDmUser: (user: PresenceUser) => void;
}

export function RoomCard({ room, users, isCurrent, onEnterRoom, onDmUser }: Props) {
  const [menuState, setMenuState] = useState<{ anchor: HTMLElement; user: PresenceUser } | null>(null);
  const [decorateOpen, setDecorateOpen] = useState(false);
  const me = useStore((s) => s.user);
  const setRooms = useStore((s) => s.setRooms);
  const rooms = useStore((s) => s.rooms);
  const navigate = useNavigate();

  const isOwner = !!me?.email && room.ownerEmail === me.email;
  const locked = !!room.locked;
  const canEnter = !locked || isOwner;
  const deco = room.decorations;

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
    <>
    <Card
      variant="outlined"
      sx={{
        ...buildBorderSx(deco ?? {}),
        ...(deco ? buildCardBg(deco) : {}),
        // keep fallback color border if no accent set
        ...(!deco?.accentColor && room.color ? { borderLeft: `4px solid ${room.color}` } : {}),
        borderRadius: 1.5,
        outline: isCurrent ? `2px solid` : "none",
        outlineColor: "primary.main",
        p: 1,
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        boxShadow: deco?.glow
          ? `0 0 14px 3px ${(deco.accentColor ?? room.color ?? "#7b1fa2")}55`
          : undefined,
        "&:hover": { boxShadow: deco?.glow ? undefined : 2 },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
          {locked && !isOwner && (
            <Tooltip title="Locked — knock to get the owner's attention">
              <LockIcon fontSize="small" sx={{ color: "text.secondary" }} />
            </Tooltip>
          )}
          {deco?.emoji && (
            <Typography sx={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{deco.emoji}</Typography>
          )}
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: deco?.nameColor || undefined,
              fontStyle: deco?.nameItalic ? "italic" : undefined,
              textTransform: deco?.nameUppercase ? "uppercase" : undefined,
            }}
          >
            {room.name}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0}>
          {isOwner && (
            <Tooltip title="Decorate your office">
              <IconButton size="small" onClick={() => setDecorateOpen(true)}>
                <PaletteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
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

      {/* Motto line */}
      {deco?.motto && (
        <Typography
          variant="caption"
          sx={{ display: "block", fontStyle: "italic", color: "text.secondary", mt: 0.25, lineHeight: 1.3 }}
        >
          {deco.motto}
        </Typography>
      )}

      {/* Badge pill */}
      {deco?.badge && (
        <Box
          sx={{
            display: "inline-block",
            mt: 0.5,
            px: 0.75,
            py: 0.125,
            borderRadius: 999,
            bgcolor: deco.badgeColor ?? "#7b1fa2",
            color: "#fff",
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 10 }}>
            {deco.badge}
          </Typography>
        </Box>
      )}

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

      {/* Pinned links row */}
      {deco?.links && deco.links.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.75, pt: 0.75, borderTop: "1px solid", borderColor: "divider" }}>
          {deco.links.slice(0, 6).map((link) => (
            <Tooltip key={link.id} title={link.url}>
              <Chip
                component="a"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                label={`${LINK_ICON(link.url)} ${link.label}`}
                size="small"
                clickable
                sx={{ fontSize: 11, height: 22 }}
              />
            </Tooltip>
          ))}
        </Stack>
      )}

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
        {menuState && (menuState.user.id === me?.id || can(me, "view_all_submissions")) && (
          <MenuItem
            onClick={() => {
              navigate(`/members/${menuState.user.id}/submissions`);
              setMenuState(null);
            }}
          >
            <ArticleIcon fontSize="small" sx={{ mr: 1 }} />
            View submissions
          </MenuItem>
        )}
      </Menu>
    </Card>
    {isOwner && (
      <OfficeDecorateDialog room={room} open={decorateOpen} onClose={() => setDecorateOpen(false)} />
    )}
    </>
  );
}
