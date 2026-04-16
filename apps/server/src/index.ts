import { resolve } from "node:path";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import type { User } from "@atrium/shared";
import { loadConfig } from "./config.js";
import { registerAuth } from "./auth.js";
import { createPresenceServer, type Broadcaster } from "./presence.js";
import { closeOrphanedSessions } from "./db.js";
import { registerMetrics } from "./metrics.js";
import { registerRooms, seedRoomsIfEmpty } from "./rooms.js";
import { registerChat } from "./chat.js";

const config = loadConfig();

const app = Fastify({ logger: true });
const broadcasterRef: { current: Broadcaster | null } = { current: null };

await app.register(cors, { origin: true, credentials: true });
await app.register(cookie);
await registerAuth(app, config);
await registerRooms(app, config);
await registerMetrics(app, config);
await registerChat(app, config, broadcasterRef);
await seedRoomsIfEmpty(config.rooms);
await closeOrphanedSessions();

app.get("/healthz", async () => ({ ok: true }));

app.get("/api/config", async () => ({
  brand: {
    name: process.env.BRAND_NAME ?? "Atrium",
    logoUrl: process.env.BRAND_LOGO_URL,
    accentColor: process.env.BRAND_ACCENT_COLOR ?? "#1976d2",
  },
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

const { io, broadcaster } = createPresenceServer(app.server);
broadcasterRef.current = broadcaster;
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
