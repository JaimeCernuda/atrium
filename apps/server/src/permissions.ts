import type { FastifyReply, FastifyRequest } from "fastify";
import type { PermissionKey, User } from "@atrium/shared";
import { prisma } from "./db.js";
import { requireUser } from "./auth.js";

/**
 * The permission vocabulary. Each key maps to one or more server enforcement
 * points; which roles hold a permission is DB data (Role.permissions), editable
 * from /admin/roles. Adding a key here requires wiring a requirePermission()
 * call somewhere — otherwise it does nothing.
 */
export const PERMISSION_KEYS: readonly PermissionKey[] = [
  "manage_rooms",
  "manage_members",
  "manage_roles",
  "manage_bots",
  "view_metrics",
  "view_all_submissions",
  "submit",
  "create_reminders",
  "write_digest",
  "own_office",
];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

// Role -> permission set cache. The server is single-process, so a module-level
// cache invalidated on role mutation is sufficient. The user's *role* is still
// read from the DB per request (same cost as the old isAdmin lookup) so role
// reassignment takes effect immediately without re-login.
let roleCache: Map<string, Set<string>> | null = null;

async function loadRoleCache(): Promise<Map<string, Set<string>>> {
  const roles = await prisma.role.findMany({ select: { id: true, permissions: true } });
  roleCache = new Map(roles.map((r) => [r.id, new Set(r.permissions)]));
  return roleCache;
}

export function invalidateRoleCache(): void {
  roleCache = null;
}

export async function permissionsForRole(roleId: string): Promise<Set<string>> {
  const cache = roleCache ?? (await loadRoleCache());
  return cache.get(roleId) ?? new Set();
}

export async function getUserRole(userId: string): Promise<string> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return row?.role ?? "external";
}

export async function getUserPermissions(userId: string): Promise<PermissionKey[]> {
  const perms = await permissionsForRole(await getUserRole(userId));
  return [...perms].filter(isPermissionKey);
}

export async function userHasPermission(userId: string, perm: PermissionKey): Promise<boolean> {
  return (await permissionsForRole(await getUserRole(userId))).has(perm);
}

/**
 * Session + permission gate. Replaces the per-module requireAdmin helpers.
 * Returns the session user, or null after sending a 401/403.
 */
export async function requirePermission(
  req: FastifyRequest,
  reply: FastifyReply,
  perm: PermissionKey,
  cookieName: string,
): Promise<User | null> {
  const user = await requireUser(req, reply, cookieName);
  if (!user) return null;
  if (!(await userHasPermission(user.id, perm))) {
    reply.code(403).send({ error: "forbidden", required: perm });
    return null;
  }
  return user;
}
