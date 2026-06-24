import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ChatMessage, GlobalChatConfig, User } from "@atrium/shared";
import {
  getGlobalChatConfig,
  getUserGroupPolicy,
  prisma,
  setGlobalChatConfig,
  setUserGroupPolicy,
} from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { requirePermission } from "./permissions.js";
import type { ZulipManager } from "./zulip-manager.js";

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
  // The same ZulipManager instance the presence layer uses. Resolved lazily via
  // a ref because the presence server (and its manager) is built after routes
  // are registered. When set + a global mapping exists + the poster is linked,
  // the "Global" chat reads/writes the configured Zulip channel+topic instead of
  // the internal Message table.
  zulipRef: { current: ZulipManager | null } = { current: null },
): Promise<void> {
  async function user(req: FastifyRequest, reply: FastifyReply): Promise<User | null> {
    return requireUser(req, reply, config.session.cookieName);
  }

  app.get<{ Querystring: { before?: string; limit?: string } }>(
    "/api/chat/global",
    async (req, reply) => {
      const me = await user(req, reply);
      if (!me) return reply;
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      // When Global is mapped to a Zulip channel+topic and the viewer is linked,
      // read the live Zulip history. Unlinked viewers fall through to the
      // internal Message table so they aren't blocked.
      const cfg = await getGlobalChatConfig();
      if (cfg.channelId != null && cfg.topicName) {
        const client = zulipRef.current?.get(me.id);
        if (client) {
          try {
            return await client.fetchHistory(cfg.channelId, cfg.topicName, limit);
          } catch {
            return [];
          }
        }
      }
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
    // When Global is mapped + the poster is linked, post to Zulip. The live echo
    // arrives via the zulip:message event, which the client mirrors into Global.
    const cfg = await getGlobalChatConfig();
    const client = zulipRef.current?.get(me.id);
    if (cfg.channelId != null && cfg.topicName && client) {
      try {
        await client.sendMessage(cfg.channelId, cfg.topicName, body);
        return reply.code(202).send({ ok: true });
      } catch (err) {
        return reply
          .code(502)
          .send({ error: err instanceof Error ? err.message : "Zulip send failed" });
      }
    }
    const msg = await prisma.message.create({
      data: { senderId: me.id, recipientId: null, roomId: null, body },
      include: { sender: { select: SENDER_SELECT } },
    });
    const apiMsg = toApi(msg);
    broadcaster.current?.emitGlobal(apiMsg);
    return apiMsg;
  });

  // ───── Admin: Global-chat -> Zulip channel+topic mapping ─────
  // GET is readable by any authenticated user (non-sensitive: a channel id +
  // topic name) so the client can seed its global mapping during bootstrap.
  // PATCH is gated by manage_rooms.
  app.get("/api/admin/global-settings", async (req, reply) => {
    if (!(await user(req, reply))) return reply;
    return await getGlobalChatConfig();
  });

  app.patch<{ Body: GlobalChatConfig }>("/api/admin/global-settings", async (req, reply) => {
    if (!(await requirePermission(req, reply, "manage_rooms", config.session.cookieName)))
      return reply;
    const rawChannel = req.body?.channelId;
    const channelId =
      typeof rawChannel === "number" && Number.isInteger(rawChannel) && rawChannel > 0
        ? rawChannel
        : null;
    const topicName = (req.body?.topicName ?? "").trim() || null;
    await setGlobalChatConfig(channelId, topicName);
    return await getGlobalChatConfig();
  });

  // ───── Admin: Zulip user-group visibility policy ─────
  app.get("/api/admin/user-group-policy", async (req, reply) => {
    const me = await user(req, reply);
    if (!me) return reply;
    const policy = await getUserGroupPolicy();
    const client = zulipRef.current?.get(me.id);
    if (!client) return { policy, allGroups: [] };
    try {
      return { policy, allGroups: await client.fetchUserGroups() };
    } catch {
      return { policy, allGroups: [] };
    }
  });

  app.patch<{ Body: { featured?: number[]; secondary?: number[] } }>(
    "/api/admin/user-group-policy",
    async (req, reply) => {
      if (!(await requirePermission(req, reply, "manage_rooms", config.session.cookieName)))
        return reply;
      const featured = Array.isArray(req.body?.featured)
        ? req.body!.featured.filter((n) => Number.isInteger(n))
        : [];
      const secondary = Array.isArray(req.body?.secondary)
        ? req.body!.secondary.filter((n) => Number.isInteger(n))
        : [];
      return { policy: await setUserGroupPolicy(featured, secondary) };
    },
  );

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
