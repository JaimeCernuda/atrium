import type { Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";
import type {
  ClientToServerEvents,
  PresenceUser,
  ServerToClientEvents,
  User,
} from "@atrium/shared";
import { closeMeetingSessions, closePresenceSessions, openMeetingSession, openPresenceSession } from "./db.js";

type PresenceIO = IOServer<ClientToServerEvents, ServerToClientEvents, object, { user: User }>;

export function createPresenceServer(httpServer: HttpServer): PresenceIO {
  const io: PresenceIO = new IOServer(httpServer, {
    cors: { origin: true, credentials: true },
  });

  const userRoom = new Map<string, string>();
  const users = new Map<string, PresenceUser>();

  function snapshot(): Record<string, PresenceUser[]> {
    const by: Record<string, PresenceUser[]> = {};
    for (const [userId, roomId] of userRoom) {
      const u = users.get(userId);
      if (!u) continue;
      (by[roomId] ??= []).push(u);
    }
    return by;
  }

  io.on("connection", (socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const presenceUser: PresenceUser = { ...user, socketId: socket.id, inMeeting: false };
    users.set(user.id, presenceUser);
    socket.emit("presence:snapshot", snapshot());

    socket.on("presence:join", (roomId) => {
      const prev = userRoom.get(user.id);
      if (prev === roomId) return;
      if (prev) io.emit("presence:leave", { userId: user.id, roomId: prev });
      userRoom.set(user.id, roomId);
      io.emit("presence:enter", { user: presenceUser, roomId });
      openPresenceSession(user.id, roomId).catch((err) =>
        console.error("openPresenceSession", err),
      );
    });

    socket.on("presence:meeting-start", () => {
      presenceUser.inMeeting = true;
      io.emit("presence:meeting", { userId: user.id, inMeeting: true });
      const roomId = userRoom.get(user.id);
      if (roomId) {
        openMeetingSession(user.id, roomId).catch((err) =>
          console.error("openMeetingSession", err),
        );
      }
    });

    socket.on("presence:meeting-end", () => {
      presenceUser.inMeeting = false;
      io.emit("presence:meeting", { userId: user.id, inMeeting: false });
      closeMeetingSessions(user.id).catch((err) =>
        console.error("closeMeetingSessions", err),
      );
    });

    socket.on("disconnect", () => {
      const roomId = userRoom.get(user.id);
      userRoom.delete(user.id);
      users.delete(user.id);
      if (roomId) io.emit("presence:leave", { userId: user.id, roomId });
      Promise.all([closePresenceSessions(user.id), closeMeetingSessions(user.id)]).catch((err) =>
        console.error("close sessions on disconnect", err),
      );
    });
  });

  return io;
}
