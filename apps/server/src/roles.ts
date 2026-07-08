import type { FastifyInstance } from "fastify";
import type { PermissionKey, RoleInfo } from "@atrium/shared";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import {
  PERMISSION_KEYS,
  getUserRole,
  invalidateRoleCache,
  isPermissionKey,
  requirePermission,
} from "./permissions.js";

const SLUG_RE = /^[a-z][a-z0-9_-]{1,31}$/;

/** Members of a deleted role fall back to this role. */
export const DEFAULT_ROLE = "external";

/** The owner role can never lose these (no painting yourself out of the admin UI). */
const OWNER_LOCKED_PERMISSIONS: PermissionKey[] = ["manage_roles", "manage_members"];

const DEFAULT_ROLES: Array<{
  id: string;
  name: string;
  sortOrder: number;
  isProtected: boolean;
  permissions: PermissionKey[];
}> = [
  { id: "owner", name: "Owner", sortOrder: 0, isProtected: true, permissions: [...PERMISSION_KEYS] },
  {
    id: "professor",
    name: "Professor",
    sortOrder: 1,
    isProtected: false,
    permissions: [
      "manage_rooms",
      "manage_members",
      "view_metrics",
      "view_all_submissions",
      "manage_submissions",
      "write_digest",
      "submit",
      "create_reminders",
      "own_office",
    ],
  },
  {
    id: "phd",
    name: "PhD",
    sortOrder: 2,
    isProtected: false,
    permissions: ["submit", "create_reminders", "own_office"],
  },
  {
    id: "student",
    name: "Student",
    sortOrder: 3,
    isProtected: false,
    permissions: ["submit", "create_reminders"],
  },
  { id: "external", name: "External", sortOrder: 4, isProtected: true, permissions: [] },
];

/** Populate default roles on first boot (DB has no roles yet). Data, not migration. */
export async function seedRolesIfEmpty(): Promise<void> {
  const count = await prisma.role.count();
  if (count > 0) return;
  await prisma.role.createMany({
    data: DEFAULT_ROLES.map((r) => ({ ...r, permissions: [...r.permissions] })),
  });
  invalidateRoleCache();
  console.log(`[seed] inserted ${DEFAULT_ROLES.length} default roles`);
}

/**
 * The owner role is the superuser and must hold every permission key. When new
 * keys are added to PERMISSION_KEYS, existing deployments (whose owner row was
 * seeded with the older list) would otherwise lack them — including the new key
 * needed to reach its own toggle in the roles UI. Runs on every boot; a no-op
 * once the owner already has them all.
 */
export async function ensureOwnerPermissions(): Promise<void> {
  const owner = await prisma.role.findUnique({ where: { id: "owner" } });
  if (!owner) return;
  const full = [...PERMISSION_KEYS];
  const missing = full.filter((p) => !owner.permissions.includes(p));
  if (missing.length === 0) return;
  await prisma.role.update({ where: { id: "owner" }, data: { permissions: full } });
  invalidateRoleCache();
  console.log(`[roles] granted owner missing permissions: ${missing.join(", ")}`);
}

function toApi(
  row: { id: string; name: string; permissions: string[]; sortOrder: number; isProtected: boolean },
  memberCount: number,
): RoleInfo {
  return {
    id: row.id,
    name: row.name,
    permissions: row.permissions.filter(isPermissionKey),
    sortOrder: row.sortOrder,
    isProtected: row.isProtected,
    memberCount,
  };
}

function validatePermissions(raw: unknown): { ok: true; perms: string[] } | { ok: false; bad: string } {
  const list = Array.isArray(raw) ? raw.filter((p): p is string => typeof p === "string") : [];
  const perms = [...new Set(list)];
  const bad = perms.find((p) => !isPermissionKey(p));
  if (bad !== undefined) return { ok: false, bad };
  return { ok: true, perms };
}

export async function registerRoles(app: FastifyInstance, config: Config): Promise<void> {
  // Any authenticated user may read roles (names are needed for chips/dropdowns).
  app.get("/api/roles", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;
    const [roles, counts] = await Promise.all([
      prisma.role.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.user.groupBy({ by: ["role"], _count: { role: true } }),
    ]);
    const countByRole = new Map(counts.map((c) => [c.role, c._count.role]));
    return reply.send({
      roles: roles.map((r) => toApi(r, countByRole.get(r.id) ?? 0)),
      allKeys: PERMISSION_KEYS,
    });
  });

  app.post<{ Body: { id?: string; name?: string; permissions?: string[] } }>(
    "/api/roles",
    async (req, reply) => {
      const user = await requirePermission(req, reply, "manage_roles", config.session.cookieName);
      if (!user) return;
      const body = req.body ?? {};
      const id = (body.id ?? "").trim();
      const name = (body.name ?? "").trim();
      if (!SLUG_RE.test(id)) return reply.code(400).send({ error: "invalid_role_id" });
      if (!name || name.length > 50) return reply.code(400).send({ error: "invalid_name" });
      const v = validatePermissions(body.permissions ?? []);
      if (!v.ok) return reply.code(400).send({ error: "invalid_permission", permission: v.bad });
      if (await prisma.role.findUnique({ where: { id } })) {
        return reply.code(400).send({ error: "role_exists" });
      }
      const maxOrder = await prisma.role.aggregate({ _max: { sortOrder: true } });
      const row = await prisma.role.create({
        data: { id, name, permissions: v.perms, sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
      });
      invalidateRoleCache();
      return reply.send(toApi(row, 0));
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { name?: string; permissions?: string[]; sortOrder?: number };
  }>("/api/roles/:id", async (req, reply) => {
    const user = await requirePermission(req, reply, "manage_roles", config.session.cookieName);
    if (!user) return;
    const role = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!role) return reply.code(404).send({ error: "not_found" });

    const body = req.body ?? {};
    const data: { name?: string; permissions?: string[]; sortOrder?: number } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name || name.length > 50) return reply.code(400).send({ error: "invalid_name" });
      data.name = name;
    }

    if (body.permissions !== undefined) {
      const v = validatePermissions(body.permissions);
      if (!v.ok) return reply.code(400).send({ error: "invalid_permission", permission: v.bad });
      const perms = v.perms;
      // Guardrail: owner always keeps its locked permissions.
      if (role.id === "owner") {
        for (const locked of OWNER_LOCKED_PERMISSIONS) {
          if (!perms.includes(locked)) perms.push(locked);
        }
      }
      // Guardrail: you cannot strip manage_roles from your own role.
      const editorRole = await getUserRole(user.id);
      if (editorRole === role.id && !perms.includes("manage_roles")) {
        return reply.code(400).send({ error: "cannot_revoke_own_roles_access" });
      }
      data.permissions = perms;
    }

    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) | 0;

    const row = await prisma.role.update({ where: { id: role.id }, data });
    invalidateRoleCache();
    const memberCount = await prisma.user.count({ where: { role: role.id } });
    return reply.send(toApi(row, memberCount));
  });

  app.delete<{ Params: { id: string } }>("/api/roles/:id", async (req, reply) => {
    const user = await requirePermission(req, reply, "manage_roles", config.session.cookieName);
    if (!user) return;
    const role = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!role) return reply.code(404).send({ error: "not_found" });
    if (role.isProtected) return reply.code(400).send({ error: "role_protected" });

    // Members of the deleted role fall back to the default role.
    const reassigned = await prisma.user.updateMany({
      where: { role: role.id },
      data: { role: DEFAULT_ROLE, isAdmin: false },
    });
    await prisma.role.delete({ where: { id: role.id } });
    invalidateRoleCache();
    return reply.send({ ok: true, reassigned: reassigned.count });
  });
}
