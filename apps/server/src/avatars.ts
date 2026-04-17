import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { getUser, requireUser } from "./auth.js";
import type { Broadcaster } from "./presence.js";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function registerAvatars(
  app: FastifyInstance,
  config: Config,
  avatarDir: string,
  broadcaster: { current: Broadcaster | null },
): Promise<void> {
  const root = resolve(avatarDir);

  await app.register(fastifyStatic, {
    root,
    prefix: "/avatars/",
    decorateReply: false,
    cacheControl: true,
    maxAge: 3600_000,
  });

  app.post("/api/me/avatar", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return reply;

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file uploaded" });
    if (!ALLOWED.has(file.mimetype)) {
      return reply.code(415).send({ error: `unsupported type ${file.mimetype}` });
    }

    const ext = EXT[file.mimetype]!;
    const filename = `${user.id.replace(/[^a-z0-9-]/gi, "_")}-${randomBytes(4).toString("hex")}.${ext}`;
    const fullPath = join(root, filename);

    const buf = await file.toBuffer();
    await writeFile(fullPath, buf);

    const url = `/avatars/${filename}`;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { imageUrl: url },
      select: { id: true, name: true, email: true, imageUrl: true },
    });
    broadcaster.current?.broadcastUserUpdate({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      imageUrl: updated.imageUrl ?? undefined,
    });
    return { imageUrl: url };
  });

  app.delete("/api/me/avatar", async (req, reply) => {
    const user = await getUser(req, config.session.cookieName);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { imageUrl: null },
      select: { id: true, name: true, email: true, imageUrl: true },
    });
    broadcaster.current?.broadcastUserUpdate({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      imageUrl: updated.imageUrl ?? undefined,
    });
    return { ok: true };
  });
}
