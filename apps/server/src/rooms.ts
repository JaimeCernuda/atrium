import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Room } from "@atrium/shared";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";

function toApi(room: {
  id: string;
  name: string;
  color: string | null;
  category: string | null;
  disableMeeting: boolean;
  externalMeetUrl: string | null;
}): Room {
  return {
    id: room.id,
    name: room.name,
    color: room.color ?? undefined,
    category: room.category ?? undefined,
    disableMeeting: room.disableMeeting,
    externalMeetUrl: room.externalMeetUrl ?? undefined,
  };
}

/**
 * Populate rooms from ROOMS_FILE on first startup (DB is empty).
 * Idempotent: no-op if any rooms already exist.
 */
export async function seedRoomsIfEmpty(rooms: Room[]): Promise<void> {
  const count = await prisma.room.count();
  if (count > 0 || rooms.length === 0) return;
  await prisma.room.createMany({
    data: rooms.map((r, i) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      category: r.category,
      disableMeeting: r.disableMeeting ?? false,
      externalMeetUrl: r.externalMeetUrl,
      sortOrder: i,
    })),
  });
  console.log(`[seed] inserted ${rooms.length} rooms from ROOMS_FILE`);
}

export async function registerRooms(app: FastifyInstance, config: Config): Promise<void> {
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

  app.get("/api/rooms", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return reply;
    const rooms = await prisma.room.findMany({ orderBy: { sortOrder: "asc" } });
    return rooms.map(toApi);
  });

  app.post<{ Body: Room }>("/api/rooms", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    const body = req.body;
    if (!body?.id || !body?.name) {
      return reply.code(400).send({ error: "id and name required" });
    }
    const maxOrder = await prisma.room.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.room.create({
      data: {
        id: body.id,
        name: body.name,
        color: body.color ?? null,
        category: body.category ?? null,
        disableMeeting: body.disableMeeting ?? false,
        externalMeetUrl: body.externalMeetUrl ?? null,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    return toApi(created);
  });

  app.patch<{ Params: { id: string }; Body: Partial<Room> }>("/api/rooms/:id", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    const { id } = req.params;
    const body = req.body ?? {};
    const updated = await prisma.room.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.color !== undefined && { color: body.color ?? null }),
        ...(body.category !== undefined && { category: body.category ?? null }),
        ...(body.disableMeeting !== undefined && { disableMeeting: body.disableMeeting }),
        ...(body.externalMeetUrl !== undefined && { externalMeetUrl: body.externalMeetUrl ?? null }),
      },
    });
    return toApi(updated);
  });

  app.delete<{ Params: { id: string } }>("/api/rooms/:id", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    await prisma.room.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  app.post<{ Body: { order: string[] } }>("/api/rooms/reorder", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return reply;
    const { order } = req.body;
    if (!Array.isArray(order)) return reply.code(400).send({ error: "order must be an array" });
    await prisma.$transaction(
      order.map((id, idx) => prisma.room.update({ where: { id }, data: { sortOrder: idx } })),
    );
    return { ok: true };
  });
}
