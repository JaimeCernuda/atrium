import type { FastifyInstance } from "fastify";
import type { Reminder, ReminderCategory } from "@atrium/shared";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";

const VALID_CATEGORIES: ReminderCategory[] = ["deadline", "event", "admin", "other"];

function coerceCategory(raw: unknown): ReminderCategory {
  return VALID_CATEGORIES.includes(raw as ReminderCategory)
    ? (raw as ReminderCategory)
    : "other";
}

function parseDueAt(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function hydrateCreators(
  rows: Array<{
    id: string;
    title: string;
    body: string | null;
    dueAt: Date;
    category: string;
    createdById: string;
    createdAt: Date;
  }>,
): Promise<Reminder[]> {
  if (rows.length === 0) return [];
  const ids = Array.from(new Set(rows.map((r) => r.createdById)));
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    dueAt: r.dueAt.toISOString(),
    category: coerceCategory(r.category),
    createdById: r.createdById,
    createdByName: nameById.get(r.createdById) ?? "unknown",
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function registerReminders(app: FastifyInstance, config: Config): Promise<void> {
  app.get<{ Querystring: { scope?: string } }>("/api/reminders", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;

    const scope = req.query.scope ?? "upcoming";
    const now = new Date();
    const cutoffPast = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const where =
      scope === "all"
        ? {}
        : scope === "past"
          ? { dueAt: { lt: now, gte: cutoffPast } }
          : { dueAt: { gte: cutoffPast } };

    const rows = await prisma.reminder.findMany({
      where,
      orderBy: { dueAt: "asc" },
      take: 200,
    });

    return reply.send({ items: await hydrateCreators(rows) });
  });

  app.post<{
    Body: { title?: string; body?: string | null; dueAt?: string; category?: string };
  }>("/api/reminders", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;

    const body = req.body ?? {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length === 0 || title.length > 200) {
      return reply.code(400).send({ error: "invalid_title" });
    }
    const dueAt = parseDueAt(body.dueAt);
    if (!dueAt) return reply.code(400).send({ error: "invalid_due_at" });
    const bodyText = typeof body.body === "string" ? body.body.trim() : null;
    const category = coerceCategory(body.category);

    const row = await prisma.reminder.create({
      data: {
        title,
        body: bodyText && bodyText.length > 0 ? bodyText : null,
        dueAt,
        category,
        createdById: user.id,
      },
    });
    const [hydrated] = await hydrateCreators([row]);
    return reply.send(hydrated);
  });

  app.patch<{
    Params: { id: string };
    Body: { title?: string; body?: string | null; dueAt?: string; category?: string };
  }>("/api/reminders/:id", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;

    const existing = await prisma.reminder.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: "not_found" });
    if (existing.createdById !== user.id) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { isAdmin: true },
      });
      if (!dbUser?.isAdmin) return reply.code(403).send({ error: "forbidden" });
    }

    const patch: Record<string, unknown> = {};
    const b = req.body ?? {};
    if (typeof b.title === "string") {
      const t = b.title.trim();
      if (t.length === 0 || t.length > 200) return reply.code(400).send({ error: "invalid_title" });
      patch.title = t;
    }
    if (b.body !== undefined) {
      const v = typeof b.body === "string" ? b.body.trim() : null;
      patch.body = v && v.length > 0 ? v : null;
    }
    if (b.dueAt !== undefined) {
      const d = parseDueAt(b.dueAt);
      if (!d) return reply.code(400).send({ error: "invalid_due_at" });
      patch.dueAt = d;
    }
    if (b.category !== undefined) patch.category = coerceCategory(b.category);

    const row = await prisma.reminder.update({ where: { id: req.params.id }, data: patch });
    const [hydrated] = await hydrateCreators([row]);
    return reply.send(hydrated);
  });

  app.delete<{ Params: { id: string } }>("/api/reminders/:id", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;

    const existing = await prisma.reminder.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: "not_found" });
    if (existing.createdById !== user.id) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { isAdmin: true },
      });
      if (!dbUser?.isAdmin) return reply.code(403).send({ error: "forbidden" });
    }

    await prisma.reminder.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });
}
