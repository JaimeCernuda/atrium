import type { FastifyInstance, FastifyReply } from "fastify";
import type { BotTokenCreated, BotTokenInfo } from "@atrium/shared";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { generateBotToken } from "./bot-auth.js";

const ALLOWED_SCOPES = new Set([
  "digest:write",
  "reminders:read",
  "reminders:write",
]);

async function verifyAdmin(userId: string, reply: FastifyReply): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  if (!row?.isAdmin) {
    reply.code(403).send({ error: "admin_required" });
    return false;
  }
  return true;
}

function toInfo(row: {
  id: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
}): BotTokenInfo {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export async function registerBotTokens(app: FastifyInstance, config: Config): Promise<void> {
  app.get("/api/bot-tokens", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;
    if (!(await verifyAdmin(user.id, reply))) return;

    const rows = await prisma.botToken.findMany({ orderBy: { createdAt: "desc" } });
    return reply.send({ items: rows.map(toInfo) });
  });

  app.post<{ Body: { name?: string; scopes?: string[] } }>(
    "/api/bot-tokens",
    async (req, reply) => {
      const user = await requireUser(req, reply, config.session.cookieName);
      if (!user) return;
      if (!(await verifyAdmin(user.id, reply))) return;

      const body = req.body ?? {};
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length === 0 || name.length > 100) {
        return reply.code(400).send({ error: "invalid_name" });
      }
      const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s) => typeof s === "string") : [];
      if (scopes.length === 0 || scopes.some((s) => !ALLOWED_SCOPES.has(s))) {
        return reply.code(400).send({
          error: "invalid_scopes",
          allowed: Array.from(ALLOWED_SCOPES),
        });
      }

      const { plaintext, hash } = generateBotToken();
      const row = await prisma.botToken.create({
        data: { name, tokenHash: hash, scopes, createdBy: user.id },
      });
      const response: BotTokenCreated = { ...toInfo(row), token: plaintext };
      return reply.send(response);
    },
  );

  app.delete<{ Params: { id: string } }>("/api/bot-tokens/:id", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;
    if (!(await verifyAdmin(user.id, reply))) return;

    await prisma.botToken.deleteMany({ where: { id: req.params.id } });
    return reply.send({ ok: true });
  });
}
