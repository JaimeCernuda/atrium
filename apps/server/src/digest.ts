import type { FastifyInstance } from "fastify";
import type { Digest, DigestSummary } from "@atrium/shared";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { requireBotScope } from "./bot-auth.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(raw: string): Date | null {
  if (!ISO_DATE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function extractTitle(md: string): string | null {
  const match = md.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function toApi(row: {
  date: Date;
  markdown: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Digest {
  return {
    date: formatDate(row.date),
    markdown: row.markdown,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(row: {
  date: Date;
  title: string | null;
  createdAt: Date;
}): DigestSummary {
  return {
    date: formatDate(row.date),
    title: row.title,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function registerDigest(app: FastifyInstance, config: Config): Promise<void> {
  app.get<{ Querystring: { limit?: string; before?: string } }>(
    "/api/digest",
    async (req, reply) => {
      const user = await requireUser(req, reply, config.session.cookieName);
      if (!user) return;

      const limit = Math.min(Math.max(Number(req.query.limit ?? 30) | 0, 1), 100);
      const before = req.query.before ? parseDate(req.query.before) : null;

      const rows = await prisma.digest.findMany({
        where: before ? { date: { lt: before } } : undefined,
        orderBy: { date: "desc" },
        take: limit,
        select: { date: true, title: true, createdAt: true },
      });

      return reply.send({ items: rows.map(toSummary) });
    },
  );

  app.get<{ Params: { date: string } }>("/api/digest/:date", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;

    const date = parseDate(req.params.date);
    if (!date) return reply.code(400).send({ error: "invalid_date" });

    const row = await prisma.digest.findUnique({ where: { date } });
    if (!row) return reply.code(404).send({ error: "not_found" });

    return reply.send(toApi(row));
  });

  app.post<{ Body: { date?: string; markdown?: string } }>(
    "/api/digest",
    async (req, reply) => {
      const bot = await requireBotScope(req, reply, "digest:write");
      if (!bot) return;

      const body = req.body ?? {};
      if (typeof body.date !== "string" || typeof body.markdown !== "string") {
        return reply.code(400).send({ error: "missing_fields" });
      }
      const date = parseDate(body.date);
      if (!date) return reply.code(400).send({ error: "invalid_date" });
      const markdown = body.markdown.trim();
      if (markdown.length === 0 || markdown.length > 200_000) {
        return reply.code(400).send({ error: "markdown_length" });
      }

      const title = extractTitle(markdown);
      const row = await prisma.digest.upsert({
        where: { date },
        create: { date, markdown, title, authorId: `bot:${bot.id}` },
        update: { markdown, title },
      });

      return reply.send(toApi(row));
    },
  );

  app.delete<{ Params: { date: string } }>("/api/digest/:date", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isAdmin: true },
    });
    if (!dbUser?.isAdmin) return reply.code(403).send({ error: "admin_required" });

    const date = parseDate(req.params.date);
    if (!date) return reply.code(400).send({ error: "invalid_date" });

    await prisma.digest.deleteMany({ where: { date } });
    return reply.send({ ok: true });
  });
}
