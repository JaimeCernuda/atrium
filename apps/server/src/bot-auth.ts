import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db.js";

const TOKEN_PREFIX = "atrbot_";

export function generateBotToken(): { plaintext: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  const plaintext = `${TOKEN_PREFIX}${raw}`;
  return { plaintext, hash: hashBotToken(plaintext) };
}

export function hashBotToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function requireBotScope(
  req: FastifyRequest,
  reply: FastifyReply,
  scope: string,
): Promise<{ id: string; name: string; scopes: string[] } | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "bot_token_required" });
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token.startsWith(TOKEN_PREFIX)) {
    reply.code(401).send({ error: "bot_token_required" });
    return null;
  }

  const record = await prisma.botToken.findUnique({
    where: { tokenHash: hashBotToken(token) },
  });
  if (!record) {
    reply.code(401).send({ error: "invalid_bot_token" });
    return null;
  }
  if (!record.scopes.includes(scope)) {
    reply.code(403).send({ error: "insufficient_scope", required: scope });
    return null;
  }

  await prisma.botToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return { id: record.id, name: record.name, scopes: record.scopes };
}
