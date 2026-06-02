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
  touchLastSeen,
} from "./db.js";
import { findRoomOwnedBy, isRoomEnterableBy } from "./rooms.js";

type PresenceIO = IOServer<ClientToServerEvents, ServerToClientEvents, object, { user: User }>;

export interface Broadcaster {
  emitGlobal: (message: ChatMessage) => void;
  emitDmTo: (userIds: string[], message: ChatMessage) => void;
  broadcastUserUpdate: (user: User) => void;
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

  function moveUserToRoom(userId: string, roomId: string): void {
    const presenceUser = users.get(userId);
    if (!presenceUser) return;
    const prev = userRoom.get(userId);
    if (prev === roomId) return;
    if (prev) io.emit("presence:leave", { userId, roomId: prev });
    userRoom.set(userId, roomId);
    io.emit("presence:enter", { user: presenceUser, roomId });
    openPresenceSession(userId, roomId).catch((err) =>
      console.error("openPresenceSession", err),
    );
  }

  io.on("connection", async (socket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    const presenceUser: PresenceUser = { ...user, socketId: socket.id, inMeeting: false };
    users.set(user.id, presenceUser);
    (socketByUser.get(user.id) ?? socketByUser.set(user.id, new Set()).get(user.id)!).add(socket.id);

    // "Last login" tracks real activity (socket connects), not just OAuth round-trips.
    touchLastSeen(user.id).catch((err) => console.error("touchLastSeen", err));

    // Auto-join the user's office BEFORE emitting the snapshot, so the client
    // sees itself already placed and skips its join-Lobby fallback (avoids the
    // race where an office owner briefly lands in the Lobby on reload).
    if (!userRoom.has(user.id)) {
      try {
        const officeId = await findRoomOwnedBy(user.email);
        if (officeId) moveUserToRoom(user.id, officeId);
      } catch (err) {
        console.error("autoJoin office", err);
      }
    }
    socket.emit("presence:snapshot", snapshot());

    socket.on("presence:join", async (roomId) => {
      const check = await isRoomEnterableBy(roomId, user.email);
      if (!check.ok) {
        // Silently ignore — client should have filtered already, but double-check server-side.
        return;
      }
      moveUserToRoom(user.id, roomId);
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

    socket.on("knock:send", (roomId) => {
      const payload = { from: user, roomId };
      for (const [uid, rid] of userRoom) {
        if (rid !== roomId || uid === user.id) continue;
        for (const sid of socketsForUser(uid)) {
          io.to(sid).emit("knock:received", payload);
        }
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
    broadcastUserUpdate: (user) => {
      const existing = users.get(user.id);
      if (existing) {
        existing.name = user.name;
        existing.email = user.email;
        existing.imageUrl = user.imageUrl;
      }
      io.emit("user:updated", user);
    },
  };

  return { io, broadcaster };
}
