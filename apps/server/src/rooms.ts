import type { FastifyInstance } from "fastify";
import type { OfficeDecoration, OfficeLink, Room } from "@atrium/shared";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { requirePermission, userHasPermission } from "./permissions.js";

// Prisma raises P2002 on a unique-constraint violation (here: two rooms bound
// to the same Zulip stream). We surface that as a 409 instead of a 500.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function toApi(room: {
  id: string;
  name: string;
  color: string | null;
  category: string | null;
  disableMeeting: boolean;
  externalMeetUrl: string | null;
  ownerEmail: string | null;
  locked: boolean;
  decorations?: unknown;
  zulipStreamId?: number | null;
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
    decorations: (room.decorations as OfficeDecoration | null) ?? undefined,
    zulipStreamId: room.zulipStreamId ?? undefined,
  };
}

// Normalize an incoming ownerEmail field. Returns:
//  - { set: false } when absent (leave column unchanged)
//  - { set: true, value: string | null } when provided (empty/null clears).
// Emails are lowercased + trimmed so desk-owner comparisons stay case-insensitive.
function normalizeOwnerEmail(v: unknown): { set: false } | { set: true; value: string | null } {
  if (v === undefined) return { set: false };
  if (v === null) return { set: true, value: null };
  if (typeof v !== "string") return { set: true, value: null };
  const s = v.trim().toLowerCase();
  return { set: true, value: s.length > 0 ? s : null };
}

// Case-insensitive owner check: a desk/office owner is matched by email
// regardless of how the address was cased when stored or signed in.
function isOwnerEmail(roomOwner: string | null, userEmail: string | undefined): boolean {
  if (!roomOwner || !userEmail) return false;
  return roomOwner.trim().toLowerCase() === userEmail.trim().toLowerCase();
}

// Normalize an incoming zulipStreamId field. Returns:
//  - { set: false } when the field is absent (leave column unchanged)
//  - { set: true, value: number | null } when explicitly provided (null clears)
function normalizeStreamId(v: unknown): { set: false } | { set: true; value: number | null } {
  if (v === undefined) return { set: false };
  if (v === null) return { set: true, value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return { set: true, value: null };
  return { set: true, value: n };
}

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

  // Note: office ownership (Room.ownerEmail) is now assigned from the admin
  // Members page rather than a hard-coded seed map.
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
  if (room.locked && !isOwnerEmail(room.ownerEmail, email)) return { ok: false, reason: "locked" };
  return { ok: true };
}

export async function registerRooms(app: FastifyInstance, config: Config): Promise<void> {
  app.get("/api/rooms", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return reply;
    const rooms = await prisma.room.findMany({ orderBy: { sortOrder: "asc" } });
    return rooms.map(toApi);
  });

  app.post<{ Body: Room }>("/api/rooms", async (req, reply) => {
    if (!(await requirePermission(req, reply, "manage_rooms", config.session.cookieName))) return reply;
    const body = req.body;
    if (!body?.id || !body?.name) {
      return reply.code(400).send({ error: "id and name required" });
    }
    const maxOrder = await prisma.room.aggregate({ _max: { sortOrder: true } });
    const stream = normalizeStreamId(body.zulipStreamId);
    const owner = normalizeOwnerEmail(body.ownerEmail);
    try {
      const created = await prisma.room.create({
        data: {
          id: body.id,
          name: body.name,
          color: body.color ?? null,
          category: body.category ?? null,
          disableMeeting: body.disableMeeting ?? false,
          externalMeetUrl: body.externalMeetUrl ?? null,
          ...(owner.set ? { ownerEmail: owner.value } : {}),
          ...(stream.set ? { zulipStreamId: stream.value } : {}),
          sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        },
      });
      return toApi(created);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "That Zulip channel is already bound to another room." });
      }
      throw err;
    }
  });

  app.patch<{ Params: { id: string }; Body: Partial<Room> }>("/api/rooms/:id", async (req, reply) => {
    if (!(await requirePermission(req, reply, "manage_rooms", config.session.cookieName))) return reply;
    const { id } = req.params;
    const body = req.body ?? {};
    const stream = normalizeStreamId(body.zulipStreamId);
    const owner = normalizeOwnerEmail(body.ownerEmail);
    try {
      const updated = await prisma.room.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.color !== undefined && { color: body.color ?? null }),
          ...(body.category !== undefined && { category: body.category ?? null }),
          ...(body.disableMeeting !== undefined && { disableMeeting: body.disableMeeting }),
          ...(body.externalMeetUrl !== undefined && { externalMeetUrl: body.externalMeetUrl ?? null }),
          ...(owner.set ? { ownerEmail: owner.value } : {}),
          ...(stream.set ? { zulipStreamId: stream.value } : {}),
        },
      });
      return toApi(updated);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "That Zulip channel is already bound to another room." });
      }
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>("/api/rooms/:id", async (req, reply) => {
    if (!(await requirePermission(req, reply, "manage_rooms", config.session.cookieName))) return reply;
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
      const isOwner = isOwnerEmail(room.ownerEmail, user.email);
      if (!isOwner && !(await userHasPermission(user.id, "manage_rooms"))) {
        return reply.code(403).send({ error: "only the owner or an admin can lock this room" });
      }
      const updated = await prisma.room.update({
        where: { id: req.params.id },
        data: { locked: !!req.body?.locked },
      });
      return toApi(updated);
    },
  );

  // Rename a room you own (a desk owner renames their own desk) or any room if
  // you can manage rooms. Distinct from the admin PATCH so a desk owner who is
  // not an admin still gets a rename path without the full manage_rooms gate.
  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    "/api/rooms/:id/name",
    async (req, reply) => {
      const user = await requireUser(req, reply, config.session.cookieName);
      if (!user) return reply;
      const room = await prisma.room.findUnique({ where: { id: req.params.id } });
      if (!room) return reply.code(404).send({ error: "room not found" });
      const isOwner = isOwnerEmail(room.ownerEmail, user.email);
      if (!isOwner && !(await userHasPermission(user.id, "manage_rooms"))) {
        return reply.code(403).send({ error: "only the owner or an admin can rename this room" });
      }
      const name = String(req.body?.name ?? "").trim().slice(0, 100);
      if (!name) return reply.code(400).send({ error: "name required" });
      const updated = await prisma.room.update({
        where: { id: req.params.id },
        data: { name },
      });
      return toApi(updated);
    },
  );

  app.post<{ Body: { order: string[] } }>("/api/rooms/reorder", async (req, reply) => {
    if (!(await requirePermission(req, reply, "manage_rooms", config.session.cookieName))) return reply;
    const { order } = req.body;
    if (!Array.isArray(order)) return reply.code(400).send({ error: "order must be an array" });
    await prisma.$transaction(
      order.map((id, idx) => prisma.room.update({ where: { id }, data: { sortOrder: idx } })),
    );
    return { ok: true };
  });

  // Decoration values are rendered into CSS (via MUI sx) and link hrefs for
  // *everyone* in the office, so they are validated here, at the trust boundary.

  // Accept only safe CSS colors: hex, rgb()/rgba()/hsl()/hsla() with numeric
  // content, or a bare named color. Rejects anything that could break out of a
  // CSS declaration (`;`, `}`, `url(`, `expression(`, etc.). Returns undefined
  // for anything invalid so the field falls back to its default.
  const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|(?:rgb|hsl)a?\([0-9.,%\s/]+\)|[a-zA-Z]{1,20})$/;
  const safeColor = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const s = v.trim().slice(0, 32);
    return SAFE_COLOR.test(s) ? s : undefined;
  };
  // Links become clickable hrefs, so restrict to http(s) — blocks javascript:,
  // data:, and other script-capable schemes that new URL() would otherwise pass.
  const safeHttpUrl = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:" ? v.slice(0, 500) : undefined;
    } catch {
      return undefined;
    }
  };

  // Only the room owner can save decoration settings for their own room.
  app.patch<{ Params: { id: string }; Body: OfficeDecoration }>(
    "/api/rooms/:id/decorate",
    async (req, reply) => {
      const user = await requireUser(req, reply, config.session.cookieName);
      if (!user) return reply;
      const room = await prisma.room.findUnique({ where: { id: req.params.id } });
      if (!room) return reply.code(404).send({ error: "room not found" });
      // Strictly owner-only — admins cannot overwrite someone else's personal office decorations
      if (!isOwnerEmail(room.ownerEmail, user.email)) {
        return reply.code(403).send({ error: "only the room owner can decorate this room" });
      }
      const b = req.body ?? {};
      // Sanitize known scalar fields
      const decorations: OfficeDecoration = {};
      const bgColor = safeColor(b.bgColor);
      if (bgColor) decorations.bgColor = bgColor;
      if (b.bgGradient && typeof b.bgGradient === "object") {
        const { from, to, angle } = b.bgGradient as { from?: unknown; to?: unknown; angle?: unknown };
        const gFrom = safeColor(from);
        const gTo = safeColor(to);
        if (gFrom && gTo) {
          decorations.bgGradient = {
            from: gFrom,
            to: gTo,
            angle: typeof angle === "number" ? Math.round(angle) % 360 : 135,
          };
        }
      }
      if (["dots", "stripes", "grid"].includes(b.bgPattern as string))
        decorations.bgPattern = b.bgPattern;
      const accentColor = safeColor(b.accentColor);
      if (accentColor) decorations.accentColor = accentColor;
      if ([2, 4, 6].includes(b.borderWidth as number)) decorations.borderWidth = b.borderWidth;
      if (["solid", "dashed", "dotted"].includes(b.borderStyle as string))
        decorations.borderStyle = b.borderStyle;
      if (typeof b.glow === "boolean") decorations.glow = b.glow;
      if (typeof b.emoji === "string") decorations.emoji = b.emoji.slice(0, 8);
      if (typeof b.badge === "string") decorations.badge = b.badge.slice(0, 24);
      const badgeColor = safeColor(b.badgeColor);
      if (badgeColor) decorations.badgeColor = badgeColor;
      if (typeof b.motto === "string") decorations.motto = b.motto.slice(0, 80);
      const nameColor = safeColor(b.nameColor);
      if (nameColor) decorations.nameColor = nameColor;
      if (typeof b.nameUppercase === "boolean") decorations.nameUppercase = b.nameUppercase;
      if (typeof b.nameItalic === "boolean") decorations.nameItalic = b.nameItalic;
      // Sanitize links array (max 8); only http(s) URLs become clickable chips.
      if (Array.isArray(b.links)) {
        decorations.links = (b.links as unknown[])
          .slice(0, 8)
          .map((l): OfficeLink | null => {
            if (typeof l !== "object" || l === null) return null;
            const { id, label, url } = l as Record<string, unknown>;
            if (typeof id !== "string" || typeof label !== "string") return null;
            const safeUrl = safeHttpUrl(url);
            if (!safeUrl) return null;
            return { id: id.slice(0, 40), label: label.slice(0, 40), url: safeUrl };
          })
          .filter((l): l is OfficeLink => l !== null);
      }
      const updated = await prisma.room.update({
        where: { id: req.params.id },
        data: { decorations: decorations as object },
      });
      return toApi(updated);
    },
  );
}
