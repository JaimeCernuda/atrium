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
  ownerEmail: string | null;
  locked: boolean;
}): Room {
  return {
    id: room.id,
    name: room.name,
    color: room.color ?? undefined,
    category: room.category ?? undefined,
    disableMeeting: room.disableMeeting,
    externalMeetUrl: room.externalMeetUrl ?? undefined,
    ownerEmail: room.ownerEmail ?? undefined,
    locked: room.locked,
  };
}

const OFFICE_OWNERS: Record<string, string> = {
  Anthony: "akougkas@illinoistech.edu",
  Luke: "llogan@illinoistech.edu",
  Jaime: "jcernudagarcia@illinoistech.edu",
  Kun: "kfeng1@illinoistech.edu",
  Eneko: "egonzalez30@illinoistech.edu",
};

const COLOR_TO_CATEGORY: Record<string, string> = {
  "#9e9e9e": "Common",
  "#1976d2": "Papers",
  "#388e3c": "Projects",
  "#f57c00": "Engineering",
  "#00796b": "Academic",
  "#7b1fa2": "Offices",
};

/**
 * Populate rooms from ROOMS_FILE on first startup (DB is empty),
 * and backfill categories from color on subsequent boots if they were never set.
 */
export async function seedRoomsIfEmpty(rooms: Room[]): Promise<void> {
  const count = await prisma.room.count();
  if (count === 0 && rooms.length > 0) {
    await prisma.room.createMany({
      data: rooms.map((r, i) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        category: r.category ?? (r.color ? COLOR_TO_CATEGORY[r.color] : null) ?? null,
        disableMeeting: r.disableMeeting ?? false,
        externalMeetUrl: r.externalMeetUrl,
        sortOrder: i,
      })),
    });
    console.log(`[seed] inserted ${rooms.length} rooms from ROOMS_FILE`);
    return;
  }

  for (const [color, category] of Object.entries(COLOR_TO_CATEGORY)) {
    await prisma.room.updateMany({
      where: { color, category: null },
      data: { category },
    });
  }

  // Idempotent one-time renames and status-room additions
  await prisma.room.updateMany({
    where: { name: "Homework / In Class" },
    data: { name: "Class" },
  });
  await prisma.room.updateMany({
    where: { name: "Agentic Projects" },
    data: { name: "Agentic" },
  });

  const maxOrderRow = await prisma.room.aggregate({ _max: { sortOrder: true } });
  let nextOrder = (maxOrderRow._max.sortOrder ?? 0) + 1;
  const statusDefaults = [
    { name: "Homework", color: "#00796b" },
    { name: "Away", color: "#00796b" },
  ];
  for (const r of statusDefaults) {
    const exists = await prisma.room.findFirst({ where: { name: r.name } });
    if (!exists) {
      await prisma.room.create({
        data: {
          id: crypto.randomUUID(),
          name: r.name,
          color: r.color,
          category: "Status",
          disableMeeting: true,
          sortOrder: nextOrder++,
        },
      });
    }
  }

  // Map offices to their owners (idempotent).
  for (const [name, email] of Object.entries(OFFICE_OWNERS)) {
    await prisma.room.updateMany({
      where: { name, category: "Offices", ownerEmail: null },
      data: { ownerEmail: email },
    });
  }
}

export async function findRoomOwnedBy(email: string): Promise<string | null> {
  const row = await prisma.room.findFirst({
    where: { ownerEmail: email },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function isRoomEnterableBy(
  roomId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; reason: "locked" | "missing" }> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { locked: true, ownerEmail: true },
  });
  if (!room) return { ok: false, reason: "missing" };
  if (room.locked && room.ownerEmail !== email) return { ok: false, reason: "locked" };
  return { ok: true };
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

  // Toggle the lock on an office you own.
  app.post<{ Params: { id: string }; Body: { locked: boolean } }>(
    "/api/rooms/:id/lock",
    async (req, reply) => {
      const user = await requireUser(req, reply, config.session.cookieName);
      if (!user) return reply;
      const room = await prisma.room.findUnique({ where: { id: req.params.id } });
      if (!room) return reply.code(404).send({ error: "room not found" });
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      const isOwner = room.ownerEmail === user.email;
      if (!isOwner && !dbUser?.isAdmin) {
        return reply.code(403).send({ error: "only the owner or an admin can lock this room" });
      }
      const updated = await prisma.room.update({
        where: { id: req.params.id },
        data: { locked: !!req.body?.locked },
      });
      return toApi(updated);
    },
  );

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
