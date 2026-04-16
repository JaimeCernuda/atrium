import type { Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";
import type {
  ChatMessage,
  ClientToServerEvents,
  PresenceUser,
  ServerToClientEvents,
  User,
} from "@atrium/shared";
import {
  closeMeetingSessions,
  closePresenceSessions,
  openMeetingSession,
  openPresenceSession,
} from "./db.js";

type PresenceIO = IOServer<ClientToServerEvents, ServerToClientEvents, object, { user: User }>;

export interface Broadcaster {
  emitGlobal: (message: ChatMessage) => void;
  emitDmTo: (userIds: string[], message: ChatMessage) => void;
}

export function createPresenceServer(httpServer: HttpServer): {
  io: PresenceIO;
  broadcaster: Broadcaster;
} {
  const io: PresenceIO = new IOServer(httpServer, {
    cors: { origin: true, credentials: true },
  });

  const userRoom = new Map<string, string>();
  const users = new Map<string, PresenceUser>();
  const socketByUser = new Map<string, Set<string>>();

  function snapshot(): Record<string, PresenceUser[]> {
    const by: Record<string, PresenceUser[]> = {};
    for (const [userId, roomId] of userRoom) {
      const u = users.get(userId);
      if (!u) continue;
      (by[roomId] ??= []).push(u);
    }
    return by;
  }

  function socketsForUser(userId: string): string[] {
    return Array.from(socketByUser.get(userId) ?? []);
  }

  io.on("connection", (socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const presenceUser: PresenceUser = { ...user, socketId: socket.id, inMeeting: false };
    users.set(user.id, presenceUser);
    (socketByUser.get(user.id) ?? socketByUser.set(user.id, new Set()).get(user.id)!).add(socket.id);
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

    socket.on("ping:send", (targetUserId) => {
      const payload = { from: user, roomId: userRoom.get(user.id) ?? null };
      for (const sid of socketsForUser(targetUserId)) {
        io.to(sid).emit("ping:received", payload);
      }
    });

    socket.on("disconnect", () => {
      const userSockets = socketByUser.get(user.id);
      userSockets?.delete(socket.id);
      if (userSockets && userSockets.size > 0) return;

      socketByUser.delete(user.id);
      const roomId = userRoom.get(user.id);
      userRoom.delete(user.id);
      users.delete(user.id);
      if (roomId) io.emit("presence:leave", { userId: user.id, roomId });
      Promise.all([closePresenceSessions(user.id), closeMeetingSessions(user.id)]).catch((err) =>
        console.error("close sessions on disconnect", err),
      );
    });
  });

  const broadcaster: Broadcaster = {
    emitGlobal: (message) => io.emit("chat:global", message),
    emitDmTo: (userIds, message) => {
      const targets = new Set<string>();
      for (const uid of userIds) for (const sid of socketsForUser(uid)) targets.add(sid);
      for (const sid of targets) io.to(sid).emit("chat:dm", message);
    },
  };

  return { io, broadcaster };
}
