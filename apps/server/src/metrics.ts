import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";

export interface RoomTimeRow {
  userId: string;
  userName: string;
  roomId: string;
  totalSeconds: number;
  sessions: number;
}

export interface MeetingTimeRow {
  userId: string;
  userName: string;
  roomId: string;
  totalSeconds: number;
  sessions: number;
}

export interface DailyActivityRow {
  day: string;
  uniqueUsers: number;
  roomSeconds: number;
  meetingSeconds: number;
}

function parseRange(q: { from?: string; to?: string }): { from: Date; to: Date } {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function registerMetrics(app: FastifyInstance, config: Config): Promise<void> {
  async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return false;
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.isAdmin) {
      reply.code(403).send({ error: "admin only" });
      return false;
    }
    return true;
  }

  app.get<{ Querystring: { from?: string; to?: string } }>("/api/metrics/room-time", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    const { from, to } = parseRange(req.query);
    const rows = await prisma.$queryRaw<RoomTimeRow[]>`
      SELECT
        ps."userId"      AS "userId",
        u.name           AS "userName",
        ps."roomId"      AS "roomId",
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ps."leftAt", NOW()) - ps."joinedAt")))::int, 0) AS "totalSeconds",
        COUNT(*)::int    AS sessions
      FROM "PresenceSession" ps
      JOIN "User" u ON u.id = ps."userId"
      WHERE ps."joinedAt" >= ${from} AND ps."joinedAt" < ${to}
      GROUP BY ps."userId", u.name, ps."roomId"
      ORDER BY "totalSeconds" DESC
    `;
    return { from, to, rows };
  });

  app.get<{ Querystring: { from?: string; to?: string } }>("/api/metrics/meeting-time", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    const { from, to } = parseRange(req.query);
    const rows = await prisma.$queryRaw<MeetingTimeRow[]>`
      SELECT
        ms."userId"      AS "userId",
        u.name           AS "userName",
        ms."roomId"      AS "roomId",
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ms."endedAt", NOW()) - ms."startedAt")))::int, 0) AS "totalSeconds",
        COUNT(*)::int    AS sessions
      FROM "MeetingSession" ms
      JOIN "User" u ON u.id = ms."userId"
      WHERE ms."startedAt" >= ${from} AND ms."startedAt" < ${to}
      GROUP BY ms."userId", u.name, ms."roomId"
      ORDER BY "totalSeconds" DESC
    `;
    return { from, to, rows };
  });

  app.get<{ Querystring: { from?: string; to?: string } }>("/api/metrics/daily-activity", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    const { from, to } = parseRange(req.query);
    const rows = await prisma.$queryRaw<DailyActivityRow[]>`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', ${from}::timestamptz),
          date_trunc('day', ${to}::timestamptz),
          '1 day'::interval
        )::date AS day
      ),
      presence AS (
        SELECT date_trunc('day', "joinedAt")::date AS day,
               COUNT(DISTINCT "userId")::int       AS "uniqueUsers",
               COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE("leftAt", NOW()) - "joinedAt")))::int, 0) AS seconds
        FROM "PresenceSession"
        WHERE "joinedAt" >= ${from} AND "joinedAt" < ${to}
        GROUP BY 1
      ),
      meeting AS (
        SELECT date_trunc('day', "startedAt")::date AS day,
               COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt")))::int, 0) AS seconds
        FROM "MeetingSession"
        WHERE "startedAt" >= ${from} AND "startedAt" < ${to}
        GROUP BY 1
      )
      SELECT
        d.day::text                  AS day,
        COALESCE(p."uniqueUsers", 0) AS "uniqueUsers",
        COALESCE(p.seconds, 0)       AS "roomSeconds",
        COALESCE(m.seconds, 0)       AS "meetingSeconds"
      FROM days d
      LEFT JOIN presence p ON p.day = d.day
      LEFT JOIN meeting m ON m.day = d.day
      ORDER BY d.day
    `;
    return { from, to, rows };
  });

  app.get("/api/metrics/summary", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    const [users, activeSessions, activeMeetings] = await Promise.all([
      prisma.user.count(),
      prisma.presenceSession.count({ where: { leftAt: null } }),
      prisma.meetingSession.count({ where: { endedAt: null } }),
    ]);
    return { users, activeSessions, activeMeetings };
  });

  app.get("/api/metrics/users", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    const users = await prisma.user.findMany({
      orderBy: [{ isAdmin: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        imageUrl: true,
        isAdmin: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });
    return {
      rows: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        imageUrl: u.imageUrl ?? null,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt.toISOString(),
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      })),
    };
  });

  app.get("/api/metrics/active-sessions", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        userName: string;
        userEmail: string;
        imageUrl: string | null;
        roomId: string;
        joinedAt: Date;
      }>
    >`
      SELECT ps.id, ps."userId", u.name AS "userName", u.email AS "userEmail",
             u."imageUrl", ps."roomId", ps."joinedAt"
      FROM "PresenceSession" ps
      JOIN "User" u ON u.id = ps."userId"
      WHERE ps."leftAt" IS NULL
      ORDER BY ps."joinedAt" DESC
    `;
    return {
      rows: rows.map((r) => ({
        ...r,
        joinedAt: r.joinedAt.toISOString(),
      })),
    };
  });

  app.get("/api/metrics/active-meetings", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        userName: string;
        userEmail: string;
        imageUrl: string | null;
        roomId: string;
        startedAt: Date;
      }>
    >`
      SELECT ms.id, ms."userId", u.name AS "userName", u.email AS "userEmail",
             u."imageUrl", ms."roomId", ms."startedAt"
      FROM "MeetingSession" ms
      JOIN "User" u ON u.id = ms."userId"
      WHERE ms."endedAt" IS NULL
      ORDER BY ms."startedAt" DESC
    `;
    return {
      rows: rows.map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
      })),
    };
  });
}
