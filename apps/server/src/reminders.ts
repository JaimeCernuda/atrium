import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Reminder, ReminderCategory } from "@atrium/shared";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { userHasPermission } from "./permissions.js";
import { hasBotBearer, requireBotScope } from "./bot-auth.js";

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

type Authz =
  | { kind: "user"; userId: string; isAdmin: boolean }
  | { kind: "bot"; botId: string; botName: string };

/** Accept either a user session cookie or a bot token Bearer header. */
async function authenticate(
  req: FastifyRequest,
  reply: FastifyReply,
  cookieName: string,
  botScope: string,
): Promise<Authz | null> {
  if (hasBotBearer(req)) {
    const bot = await requireBotScope(req, reply, botScope);
    if (!bot) return null;
    return { kind: "bot", botId: bot.id, botName: bot.name };
  }
  const sessionUser = await requireUser(req, reply, cookieName);
  if (!sessionUser) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { isAdmin: true },
  });
  return {
    kind: "user",
    userId: sessionUser.id,
    isAdmin: Boolean(dbUser?.isAdmin),
  };
}

type ReminderRow = {
  id: string;
  title: string;
  body: string | null;
  dueAt: Date;
  category: string;
  createdById: string | null;
  createdByBotId: string | null;
  createdAt: Date;
};

async function hydrate(rows: ReminderRow[]): Promise<Reminder[]> {
  if (rows.length === 0) return [];
  const userIds = Array.from(new Set(rows.map((r) => r.createdById).filter(Boolean) as string[]));
  const botIds = Array.from(new Set(rows.map((r) => r.createdByBotId).filter(Boolean) as string[]));
  const [users, bots] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    botIds.length
      ? prisma.botToken.findMany({
          where: { id: { in: botIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const botName = new Map(bots.map((b) => [b.id, b.name]));
  return rows.map((r) => {
    const isBot = r.createdByBotId !== null;
    const name = isBot
      ? (botName.get(r.createdByBotId!) ?? "bot")
      : (userName.get(r.createdById ?? "") ?? "unknown");
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      dueAt: r.dueAt.toISOString(),
      category: coerceCategory(r.category),
      createdById: r.createdById,
      createdByBotId: r.createdByBotId,
      createdByName: name,
      createdByBot: isBot,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function registerReminders(app: FastifyInstance, config: Config): Promise<void> {
  app.get<{ Querystring: { scope?: string } }>("/api/reminders", async (req, reply) => {
    const authz = await authenticate(req, reply, config.session.cookieName, "reminders:read");
    if (!authz) return;

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

    return reply.send({ items: await hydrate(rows) });
  });

  app.post<{
    Body: { title?: string; body?: string | null; dueAt?: string; category?: string };
  }>("/api/reminders", async (req, reply) => {
    const authz = await authenticate(req, reply, config.session.cookieName, "reminders:write");
    if (!authz) return;
    if (authz.kind === "user" && !(await userHasPermission(authz.userId, "create_reminders"))) {
      return reply.code(403).send({ error: "forbidden", required: "create_reminders" });
    }

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
        createdById: authz.kind === "user" ? authz.userId : null,
        createdByBotId: authz.kind === "bot" ? authz.botId : null,
      },
    });
    const [hydrated] = await hydrate([row]);
    return reply.send(hydrated);
  });

  app.patch<{
    Params: { id: string };
    Body: { title?: string; body?: string | null; dueAt?: string; category?: string };
  }>("/api/reminders/:id", async (req, reply) => {
    const authz = await authenticate(req, reply, config.session.cookieName, "reminders:write");
    if (!authz) return;

    const existing = await prisma.reminder.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    if (!canMutate(existing, authz)) {
      return reply.code(403).send({ error: "forbidden" });
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
    const [hydrated] = await hydrate([row]);
    return reply.send(hydrated);
  });

  app.delete<{ Params: { id: string } }>("/api/reminders/:id", async (req, reply) => {
    const authz = await authenticate(req, reply, config.session.cookieName, "reminders:write");
    if (!authz) return;

    const existing = await prisma.reminder.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    if (!canMutate(existing, authz)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    await prisma.reminder.delete({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });
}

/** Anyone can edit a bot-posted reminder (they're community-maintained).
 *  User-posted reminders are author-or-admin only. Bots can edit reminders
 *  they themselves posted (idempotent routine behaviour). */
function canMutate(
  row: { createdById: string | null; createdByBotId: string | null },
  authz: Authz,
): boolean {
  const isBotPosted = row.createdByBotId !== null;
  if (authz.kind === "bot") {
    return row.createdByBotId === authz.botId;
  }
  if (authz.isAdmin) return true;
  if (isBotPosted) return true; // any logged-in user can fix bot mistakes
  return row.createdById === authz.userId;
}
