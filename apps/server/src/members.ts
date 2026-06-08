import type { FastifyInstance } from "fastify";
import type { Member } from "@atrium/shared";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { requirePermission, userHasPermission } from "./permissions.js";
import { toApi as submissionToApi } from "./submissions.js";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  role: string;
  createdAt: Date;
  lastSeenAt: Date | null;
}

function toMember(
  row: MemberRow,
  roleName: string,
  office: { id: string; name: string } | null,
  submissionCount: number,
): Member {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    imageUrl: row.imageUrl,
    role: row.role,
    roleName,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    office,
    submissionCount,
  };
}

export async function registerMembers(app: FastifyInstance, config: Config): Promise<void> {
  // ---- everyone who has ever logged in, with role / office / submissions ----
  app.get("/api/members", async (req, reply) => {
    const user = await requirePermission(req, reply, "manage_members", config.session.cookieName);
    if (!user) return;

    const [users, roles, offices, subCounts] = await Promise.all([
      prisma.user.findMany({
        orderBy: [{ lastSeenAt: "desc" }],
        select: {
          id: true,
          name: true,
          email: true,
          imageUrl: true,
          role: true,
          createdAt: true,
          lastSeenAt: true,
        },
      }),
      prisma.role.findMany({ select: { id: true, name: true } }),
      prisma.room.findMany({
        where: { ownerEmail: { not: null } },
        select: { id: true, name: true, ownerEmail: true },
      }),
      prisma.submission.groupBy({ by: ["submitterId"], _count: { submitterId: true } }),
    ]);

    const roleNames = new Map(roles.map((r) => [r.id, r.name]));
    const officeByEmail = new Map(offices.map((o) => [o.ownerEmail!, { id: o.id, name: o.name }]));
    const subsByUser = new Map(subCounts.map((s) => [s.submitterId, s._count.submitterId]));

    return reply.send({
      items: users.map((u) =>
        toMember(
          u,
          roleNames.get(u.role) ?? u.role,
          officeByEmail.get(u.email) ?? null,
          subsByUser.get(u.id) ?? 0,
        ),
      ),
    });
  });

  // ---- assign role and/or office ----
  app.patch<{
    Params: { id: string };
    Body: { role?: string; officeRoomId?: string | null };
  }>("/api/members/:id", async (req, reply) => {
    const user = await requirePermission(req, reply, "manage_members", config.session.cookieName);
    if (!user) return;

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return reply.code(404).send({ error: "not_found" });

    const body = req.body ?? {};

    if (body.role !== undefined) {
      const role = await prisma.role.findUnique({ where: { id: body.role } });
      if (!role) return reply.code(400).send({ error: "unknown_role" });
      // Guardrail: you cannot change your own role (no self-demotion lockout,
      // no self-promotion); another owner has to do it.
      if (target.id === user.id && body.role !== target.role) {
        return reply.code(400).send({ error: "cannot_change_own_role" });
      }
      await prisma.user.update({
        where: { id: target.id },
        // isAdmin stays in sync: it is the legacy flag for "owner".
        data: { role: role.id, isAdmin: role.id === "owner" },
      });
    }

    if (body.officeRoomId !== undefined) {
      // Clear any office currently owned by this user.
      await prisma.room.updateMany({
        where: { ownerEmail: target.email },
        data: { ownerEmail: null },
      });
      if (body.officeRoomId !== null) {
        const room = await prisma.room.findUnique({ where: { id: body.officeRoomId } });
        if (!room) return reply.code(400).send({ error: "unknown_room" });
        // One owner per office: taking over a room displaces its previous owner.
        await prisma.room.update({
          where: { id: room.id },
          data: { ownerEmail: target.email },
        });
      }
    }

    // Return the refreshed member row.
    const refreshed = await prisma.user.findUnique({
      where: { id: target.id },
      select: {
        id: true,
        name: true,
        email: true,
        imageUrl: true,
        role: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });
    if (!refreshed) return reply.code(404).send({ error: "not_found" });
    const [roleRow, office, subCount] = await Promise.all([
      prisma.role.findUnique({ where: { id: refreshed.role }, select: { name: true } }),
      prisma.room.findFirst({
        where: { ownerEmail: refreshed.email },
        select: { id: true, name: true },
      }),
      prisma.submission.count({ where: { submitterId: refreshed.id } }),
    ]);
    return reply.send(toMember(refreshed, roleRow?.name ?? refreshed.role, office, subCount));
  });

  // ---- a member's submissions (self, or anyone with view_all_submissions) ----
  app.get<{ Params: { id: string } }>("/api/members/:id/submissions", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;

    const targetId = req.params.id === "me" ? user.id : req.params.id;
    if (targetId !== user.id && !(await userHasPermission(user.id, "view_all_submissions"))) {
      return reply.code(403).send({ error: "forbidden", required: "view_all_submissions" });
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, email: true, imageUrl: true, role: true },
    });
    if (!target) return reply.code(404).send({ error: "not_found" });

    const [roleRow, rows] = await Promise.all([
      prisma.role.findUnique({ where: { id: target.role }, select: { name: true } }),
      prisma.submission.findMany({
        where: { submitterId: target.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return reply.send({
      member: {
        id: target.id,
        name: target.name,
        email: target.email,
        imageUrl: target.imageUrl,
        role: target.role,
        roleName: roleRow?.name ?? target.role,
      },
      items: rows.map(submissionToApi),
    });
  });
}
