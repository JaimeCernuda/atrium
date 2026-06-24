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
  prisma,
  touchLastSeen,
} from "./db.js";
import { findRoomOwnedBy, isRoomEnterableBy } from "./rooms.js";
import type { Config } from "./config.js";
import { ZulipManager, type ZulipFanout } from "./zulip-manager.js";
import { processLevelZulipCache } from "./zulip-process-cache.js";

type PresenceIO = IOServer<ClientToServerEvents, ServerToClientEvents, object, { user: User }>;

export interface Broadcaster {
  emitGlobal: (message: ChatMessage) => void;
  emitDmTo: (userIds: string[], message: ChatMessage) => void;
  broadcastUserUpdate: (user: User) => void;
}

export function createPresenceServer(
  httpServer: HttpServer,
  config: Config,
): {
  io: PresenceIO;
  broadcaster: Broadcaster;
  zulip: ZulipManager;
} {
  const io: PresenceIO = new IOServer(httpServer, {
    cors: { origin: true, credentials: true },
  });

  const userRoom = new Map<string, string>();
  const users = new Map<string, PresenceUser>();
  const socketByUser = new Map<string, Set<string>>();

  function socketsForUser(userId: string): string[] {
    return Array.from(socketByUser.get(userId) ?? []);
  }

  // One per-user Zulip event-queue manager for the whole server. Fan-out is
  // scoped to the originating user's sockets only — Zulip data never leaks
  // across users.
  const zulipFanout: ZulipFanout = {
    onConnected: (userId) => {
      for (const sid of socketsForUser(userId)) io.to(sid).emit("zulip:connected");
    },
    onDisconnected: (userId) => {
      for (const sid of socketsForUser(userId)) io.to(sid).emit("zulip:disconnected");
    },
    onError: (userId, message) => {
      for (const sid of socketsForUser(userId)) io.to(sid).emit("zulip:error", { message });
    },
    onMessage: (userId, payload) => {
      for (const sid of socketsForUser(userId)) io.to(sid).emit("zulip:message", payload);
    },
    onReaction: (userId, payload) => {
      for (const sid of socketsForUser(userId)) io.to(sid).emit("zulip:reaction", payload);
    },
    onDm: (userId, payload) => {
      for (const sid of socketsForUser(userId)) io.to(sid).emit("zulip:dm", payload);
    },
    onChannels: (userId, payload) => {
      for (const sid of socketsForUser(userId)) io.to(sid).emit("zulip:channels", payload);
    },
    onUnreadSnapshot: (userId, payload) => {
      for (const sid of socketsForUser(userId)) io.to(sid).emit("zulip:unread-snapshot", payload);
    },
    onReadFlags: (userId, payload) => {
      for (const sid of socketsForUser(userId)) io.to(sid).emit("zulip:read-flags", payload);
    },
  };
  const zulip = new ZulipManager(config, zulipFanout);
  // Sweep idle process-level Zulip caches periodically (they intentionally
  // survive socket disconnects; this caps unbounded growth).
  processLevelZulipCache.startEvictionLoop();

  function snapshot(): Record<string, PresenceUser[]> {
    const by: Record<string, PresenceUser[]> = {};
    for (const [userId, roomId] of userRoom) {
      const u = users.get(userId);
      if (!u) continue;
      (by[roomId] ??= []).push(u);
    }
    return by;
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

    // Start (or attach to) this user's Zulip event queue. acquire() emits
    // zulip:connected via the fan-out once the queue registers; the client
    // fetches channels from inside its zulip:connected handler.
    zulip.acquire(user.id).catch((err) => console.error("zulip acquire", err));

    socket.on("zulip:fetch-channels", async (cb) => {
      try {
        // Served from the per-user cache (24h TTL); folders ride the broadcast.
        const data = await zulip.getChannels(user.id);
        if (!data) {
          cb?.("not linked");
          return;
        }
        socket.emit("zulip:channels", data);
        cb?.(null, data.channels);
      } catch (err) {
        cb?.(err instanceof Error ? err.message : "fetch-channels failed");
      }
    });

    socket.on("zulip:fetch-topics", async (channelId, cb) => {
      try {
        const topics = await zulip.getTopics(user.id, channelId);
        if (!topics) {
          cb?.("not linked");
          return;
        }
        socket.emit("zulip:topics", { channelId, topics });
        cb?.(null, topics);
      } catch (err) {
        cb?.(err instanceof Error ? err.message : "fetch-topics failed");
      }
    });

    socket.on("zulip:fetch-history", async ({ channelId, topicName, numBefore }, cb) => {
      const client = zulip.get(user.id);
      if (!client) {
        cb?.("not linked");
        return;
      }
      try {
        const messages = await client.fetchHistory(channelId, topicName, numBefore);
        cb?.(null, messages);
      } catch (err) {
        cb?.(err instanceof Error ? err.message : "fetch-history failed");
      }
    });

    socket.on("zulip:send", async ({ channelId, topicName, body }, cb) => {
      const client = zulip.get(user.id);
      if (!client) {
        cb?.("not linked");
        return;
      }
      const trimmed = (body ?? "").trim();
      if (!trimmed) {
        cb?.("empty message");
        return;
      }
      try {
        const result = await client.sendMessage(channelId, topicName, trimmed);
        cb?.(null, result);
      } catch (err) {
        cb?.(err instanceof Error ? err.message : "send failed");
      }
    });

    socket.on("zulip:fetch-users", async (cb) => {
      const client = zulip.get(user.id);
      if (!client) {
        cb?.("not linked");
        return;
      }
      try {
        const zUsers = await client.fetchAllUsers();
        // Match Zulip members to Atrium users by email so the office can DM them.
        const rows = await prisma.user.findMany({ select: { id: true, email: true } });
        const byEmail = new Map(rows.map((r) => [r.email.toLowerCase(), r.id]));
        const enriched = zUsers.map((u) => ({
          ...u,
          atriumUserId: byEmail.get(u.email.toLowerCase()) ?? null,
        }));
        socket.emit("zulip:users", { users: enriched });
        try {
          const groups = await client.fetchUserGroups();
          socket.emit("zulip:user-groups", { groups });
        } catch {
          // Groups are non-fatal; the DM list falls back to a flat people list.
        }
        cb?.(null, enriched);
      } catch (err) {
        cb?.(err instanceof Error ? err.message : "fetch-users failed");
      }
    });

    socket.on("zulip:send-dm", async ({ participantIds, body }, cb) => {
      const client = zulip.get(user.id);
      if (!client) {
        cb?.("not linked");
        return;
      }
      const trimmed = (body ?? "").trim();
      if (!trimmed) {
        cb?.("empty message");
        return;
      }
      try {
        cb?.(null, await client.sendDirectMessage(participantIds, trimmed));
      } catch (err) {
        cb?.(err instanceof Error ? err.message : "send-dm failed");
      }
    });

    socket.on("zulip:fetch-dm-history", async ({ participantIds, numBefore }, cb) => {
      const client = zulip.get(user.id);
      if (!client) {
        cb?.("not linked");
        return;
      }
      try {
        cb?.(null, await client.fetchDirectMessageHistory(participantIds, numBefore));
      } catch (err) {
        cb?.(err instanceof Error ? err.message : "fetch-dm-history failed");
      }
    });

    socket.on("zulip:fetch-dm-conversations", async (cb) => {
      const client = zulip.get(user.id);
      if (!client) {
        cb?.("not linked");
        return;
      }
      try {
        const conversations = await client.fetchRecentDmConversations();
        socket.emit("zulip:fetch-dm-conversations", { conversations });
        cb?.(null, conversations);
      } catch (err) {
        cb?.(err instanceof Error ? err.message : "fetch-dm-conversations failed");
      }
    });

    // Ground read-state in Zulip: when the user actually views a thread, mark it
    // read on Zulip so unread_msgs stays in sync and a re-register's snapshot
    // doesn't resurrect it as unread. Best-effort + fire-and-forget; the client
    // already cleared its local unread optimistically.
    socket.on("zulip:mark-read", async (payload) => {
      const client = zulip.get(user.id);
      if (!client) return;
      try {
        if (payload.kind === "topic") {
          await client.markTopicRead(payload.channelId, payload.topicName);
        } else {
          await client.markDmRead(payload.participantIds);
        }
      } catch {
        // Best-effort; local gating remains the live source of truth.
      }
    });

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
      // Balance the acquire() above for every socket; the manager refcounts and
      // tears down the Zulip queue when the user's last socket goes away.
      zulip.release(user.id);

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

  return { io, broadcaster, zulip };
}
