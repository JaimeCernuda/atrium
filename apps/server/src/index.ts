import { resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import type { User } from "@atrium/shared";
import { loadConfig } from "./config.js";
import { registerAuth } from "./auth.js";
import { createPresenceServer, type Broadcaster } from "./presence.js";
import type { ZulipManager } from "./zulip-manager.js";
import { closeOrphanedSessions } from "./db.js";
import { registerMetrics } from "./metrics.js";
import { registerRooms, seedRoomsIfEmpty } from "./rooms.js";
import { registerChat } from "./chat.js";
import { registerAvatars } from "./avatars.js";
import { registerDigest } from "./digest.js";
import { registerReminders } from "./reminders.js";
import { registerBotTokens } from "./bot-tokens.js";
import { registerSubmissions } from "./submissions.js";
import { registerRoles, seedRolesIfEmpty } from "./roles.js";
import { registerMembers } from "./members.js";
import { registerZulipLink } from "./zulip-link.js";

const config = loadConfig();

const app = Fastify({ logger: true });
const broadcasterRef: { current: Broadcaster | null } = { current: null };
// The presence server owns the single ZulipManager; chat.ts reads it through
// this ref to reroute Global chat to Zulip. Filled in once presence is built.
const zulipRef: { current: ZulipManager | null } = { current: null };

const avatarDir = process.env.AVATAR_DIR ?? "/data/avatars";
mkdirSync(avatarDir, { recursive: true });

// Lock CORS to an explicit allowlist. `origin: true` reflects any caller's
// Origin and, with credentials, lets ANY website script credentialed requests
// (including the multipart upload-file endpoint) against a linked user's
// session. The allowlist is the app's own public origin plus any extras from
// CORS_ORIGINS, and localhost dev origins when running in development.
const corsOrigins = new Set<string>([config.publicUrl]);
for (const extra of (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)) {
  corsOrigins.add(extra);
}
if (process.env.NODE_ENV === "development") {
  corsOrigins.add("http://localhost:5173");
  corsOrigins.add("http://127.0.0.1:5173");
}
await app.register(cors, {
  origin: (origin, cb) => {
    // Same-origin / non-browser requests (no Origin header) are allowed.
    if (!origin || corsOrigins.has(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
});
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 15 } });
await registerAuth(app, config, broadcasterRef);
await registerAvatars(app, config, avatarDir, broadcasterRef);
await registerRooms(app, config);
await registerMetrics(app, config);
await registerChat(app, config, broadcasterRef, zulipRef);
await registerDigest(app, config);
await registerReminders(app, config);
await registerBotTokens(app, config);
await registerSubmissions(app, config);
await registerRoles(app, config);
await registerMembers(app, config);
await registerZulipLink(app, config);
await seedRoomsIfEmpty(config.rooms);
await seedRolesIfEmpty();
await closeOrphanedSessions();

app.get("/healthz", async () => ({ ok: true }));

app.get("/api/config", async () => ({
  brand: {
    name: process.env.BRAND_NAME ?? "Atrium",
    shortName: process.env.BRAND_SHORT_NAME ?? process.env.BRAND_NAME ?? "Atrium",
    logoUrl: process.env.BRAND_LOGO_URL ?? "/brand/gnosis-logo.png",
    accentColor: process.env.BRAND_ACCENT_COLOR ?? "#1976d2",
  },
  defaultRoomId: config.defaultRoomId,
}));

const staticRoot = process.env.WEB_DIST ?? resolve(process.cwd(), "../web/dist");
if (existsSync(staticRoot)) {
  await app.register(fastifyStatic, { root: staticRoot });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api") || req.raw.url?.startsWith("/auth")) {
      return reply.code(404).send({ error: "not found" });
    }
    return reply.sendFile("index.html");
  });
}

await app.listen({ port: config.port, host: "0.0.0.0" });

const { io, broadcaster, zulip } = createPresenceServer(app.server, config);
broadcasterRef.current = broadcaster;
zulipRef.current = zulip;
io.use((socket, next) => {
  const rawCookie = socket.request.headers.cookie ?? "";
  const match = new RegExp(`(?:^|;\\s*)${config.session.cookieName}=([^;]+)`).exec(rawCookie);
  if (!match?.[1]) return next(new Error("unauthorized"));
  try {
    const user = app.jwt.verify<User>(decodeURIComponent(match[1]));
    socket.data.user = user;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});
