import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ChatMessage, User } from "@atrium/shared";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";

type RawMessage = {
  id: string;
  body: string;
  createdAt: Date;
  recipientId: string | null;
  sender: { id: string; name: string; email: string; imageUrl: string | null };
};

function toApi(m: RawMessage): ChatMessage {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    recipientId: m.recipientId,
    sender: {
      id: m.sender.id,
      name: m.sender.name,
      email: m.sender.email,
      imageUrl: m.sender.imageUrl ?? undefined,
    },
  };
}

const SENDER_SELECT = { id: true, name: true, email: true, imageUrl: true } as const;

export interface ChatBroadcaster {
  emitGlobal: (message: ChatMessage) => void;
  emitDmTo: (userIds: string[], message: ChatMessage) => void;
}

export async function registerChat(
  app: FastifyInstance,
  config: Config,
  broadcaster: { current: ChatBroadcaster | null },
): Promise<void> {
  async function user(req: FastifyRequest, reply: FastifyReply): Promise<User | null> {
    return requireUser(req, reply, config.session.cookieName);
  }

  app.get<{ Querystring: { before?: string; limit?: string } }>(
    "/api/chat/global",
    async (req, reply) => {
      if (!(await user(req, reply))) return reply;
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const before = req.query.before ? new Date(req.query.before) : undefined;
      const rows = await prisma.message.findMany({
        where: {
          recipientId: null,
          roomId: null,
          ...(before && { createdAt: { lt: before } }),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { sender: { select: SENDER_SELECT } },
      });
      return rows.reverse().map(toApi);
    },
  );

  app.post<{ Body: { body: string } }>("/api/chat/global", async (req, reply) => {
    const me = await user(req, reply);
    if (!me) return reply;
    const body = (req.body?.body ?? "").trim();
    if (!body) return reply.code(400).send({ error: "body required" });
    if (body.length > 2000) return reply.code(400).send({ error: "message too long" });
    const msg = await prisma.message.create({
      data: { senderId: me.id, recipientId: null, roomId: null, body },
      include: { sender: { select: SENDER_SELECT } },
    });
    const apiMsg = toApi(msg);
    broadcaster.current?.emitGlobal(apiMsg);
    return apiMsg;
  });

  app.get<{ Params: { userId: string }; Querystring: { before?: string; limit?: string } }>(
    "/api/chat/dm/:userId",
    async (req, reply) => {
      const me = await user(req, reply);
      if (!me) return reply;
      const other = req.params.userId;
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const before = req.query.before ? new Date(req.query.before) : undefined;
      const rows = await prisma.message.findMany({
        where: {
          OR: [
            { senderId: me.id, recipientId: other },
            { senderId: other, recipientId: me.id },
          ],
          ...(before && { createdAt: { lt: before } }),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { sender: { select: SENDER_SELECT } },
      });
      return rows.reverse().map(toApi);
    },
  );

  app.post<{ Params: { userId: string }; Body: { body: string } }>(
    "/api/chat/dm/:userId",
    async (req, reply) => {
      const me = await user(req, reply);
      if (!me) return reply;
      const recipientId = req.params.userId;
      const body = (req.body?.body ?? "").trim();
      if (!body) return reply.code(400).send({ error: "body required" });
      if (body.length > 2000) return reply.code(400).send({ error: "message too long" });
      const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
      if (!recipient) return reply.code(404).send({ error: "recipient not found" });
      const msg = await prisma.message.create({
        data: { senderId: me.id, recipientId, roomId: null, body },
        include: { sender: { select: SENDER_SELECT } },
      });
      const apiMsg = toApi(msg);
      broadcaster.current?.emitDmTo([me.id, recipientId], apiMsg);
      return apiMsg;
    },
  );

  app.get("/api/chat/dm/conversations", async (req, reply) => {
    const me = await user(req, reply);
    if (!me) return reply;
    const rows = await prisma.$queryRaw<
      Array<{ userId: string; name: string; email: string; imageUrl: string | null; lastAt: Date; lastBody: string }>
    >`
      SELECT u.id AS "userId", u.name, u.email, u."imageUrl",
             m."createdAt" AS "lastAt", m.body AS "lastBody"
      FROM (
        SELECT DISTINCT ON (other_id) other_id, "createdAt", body
        FROM (
          SELECT CASE WHEN "senderId" = ${me.id} THEN "recipientId" ELSE "senderId" END AS other_id,
                 "createdAt", body
          FROM "Message"
          WHERE "recipientId" IS NOT NULL
            AND ("senderId" = ${me.id} OR "recipientId" = ${me.id})
        ) t
        WHERE other_id IS NOT NULL
        ORDER BY other_id, "createdAt" DESC
      ) m
      JOIN "User" u ON u.id = m.other_id
      ORDER BY m."createdAt" DESC
      LIMIT 50
    `;
    return rows.map((r) => ({
      user: { id: r.userId, name: r.name, email: r.email, imageUrl: r.imageUrl ?? undefined },
      lastMessageAt: r.lastAt.toISOString(),
      lastMessagePreview: r.lastBody,
    }));
  });

  app.get("/api/users/search", async (req: FastifyRequest<{ Querystring: { q?: string } }>, reply) => {
    if (!(await user(req, reply))) return reply;
    const q = (req.query.q ?? "").trim();
    if (q.length < 1) return [];
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: SENDER_SELECT,
      take: 15,
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      imageUrl: u.imageUrl ?? undefined,
    }));
  });
}
