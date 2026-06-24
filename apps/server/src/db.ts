import pkg from "@prisma/client";
const { PrismaClient } = pkg;

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
});

export async function upsertUser(
  user: { id: string; email: string; name: string; imageUrl?: string },
  adminEmails: string[] = [],
): Promise<void> {
  const isAdminByEmail = adminEmails.includes(user.email.toLowerCase());
  await prisma.user.upsert({
    where: { id: user.id },
    // On re-login: refresh email/lastSeen but DO NOT overwrite the user's
    // customized name/imageUrl, nor a role assigned via the Members page.
    // ADMIN_EMAILS acts as a bootstrap floor: those emails are always owners.
    update: {
      email: user.email,
      lastSeenAt: new Date(),
      ...(isAdminByEmail ? { isAdmin: true, role: "owner" } : {}),
    },
    create: {
      id: user.id,
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      isAdmin: isAdminByEmail,
      role: isAdminByEmail ? "owner" : "external",
      lastSeenAt: new Date(),
    },
  });
}

// ───── Zulip account linking ─────
// The API key is stored AES-256-GCM-encrypted (see zulip-crypto.ts). These
// helpers take/return only the ENCRYPTED form — the plaintext key never enters
// or leaves the DB layer except through the crypto module at the boundary.

export async function linkZulipAccount(
  userId: string,
  data: { zulipEmail: string; zulipUserId: number; zulipApiKeyEnc: string },
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      zulipEmail: data.zulipEmail,
      zulipUserId: data.zulipUserId,
      zulipApiKeyEnc: data.zulipApiKeyEnc,
      zulipLinkedAt: new Date(),
    },
  });
}

/** Returns the encrypted key + email for a user, or null if not linked. */
export async function getZulipKey(
  userId: string,
): Promise<{ zulipEmail: string; zulipApiKeyEnc: string; zulipUserId: number | null } | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { zulipEmail: true, zulipApiKeyEnc: true, zulipUserId: true },
  });
  if (!row || !row.zulipApiKeyEnc || !row.zulipEmail) return null;
  return {
    zulipEmail: row.zulipEmail,
    zulipApiKeyEnc: row.zulipApiKeyEnc,
    zulipUserId: row.zulipUserId,
  };
}

export async function unlinkZulipAccount(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      zulipEmail: null,
      zulipUserId: null,
      zulipApiKeyEnc: null,
      zulipLinkedAt: null,
    },
  });
}

/** Link metadata for status display — never includes the key itself. */
export async function getZulipLink(
  userId: string,
): Promise<{ zulipEmail: string | null; zulipUserId: number | null; zulipLinkedAt: Date | null; linked: boolean }> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { zulipEmail: true, zulipUserId: true, zulipLinkedAt: true, zulipApiKeyEnc: true },
  });
  return {
    zulipEmail: row?.zulipEmail ?? null,
    zulipUserId: row?.zulipUserId ?? null,
    zulipLinkedAt: row?.zulipLinkedAt ?? null,
    linked: Boolean(row?.zulipApiKeyEnc),
  };
}

// ───── Global-chat -> Zulip channel+topic mapping (org-wide singleton) ─────

export async function getGlobalChatConfig(): Promise<{
  channelId: number | null;
  topicName: string | null;
}> {
  const row = await prisma.settings.findUnique({ where: { id: "singleton" } });
  return {
    channelId: row?.globalZulipChannelId ?? null,
    topicName: row?.globalZulipTopicName ?? null,
  };
}

export async function setGlobalChatConfig(
  channelId: number | null,
  topicName: string | null,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { globalZulipChannelId: channelId, globalZulipTopicName: topicName },
    create: { id: "singleton", globalZulipChannelId: channelId, globalZulipTopicName: topicName },
  });
}

// ───── Zulip user-group visibility policy (org-wide singleton) ─────
//
// "featured" groups are shown expanded, "secondary" collapsed; every group not
// listed in either is implicitly "hidden" (reachable only via search). Each
// column stores a JSON array of Zulip user-group ids.

export interface UserGroupPolicy {
  featured: number[];
  secondary: number[];
}

const DEFAULT_USER_GROUP_POLICY: UserGroupPolicy = {
  featured: [301997, 316940, 1545694],
  secondary: [301998, 1453788],
};

/**
 * Resolve one policy tier from its stored column.
 *   - null/undefined (never configured)  → fall back to the default seed.
 *   - "[]" (admin explicitly emptied it)  → stays empty.
 *   - "[1,2,3]"                           → those ids.
 *   - malformed JSON                      → empty (and flagged).
 */
function parseIdColumn(
  raw: string | null | undefined,
  column: string,
  fallback: number[],
): number[] {
  // Never configured: seed the default so grouping works out of the box.
  if (raw == null) return [...fallback];
  try {
    const parsed = JSON.parse(raw) as unknown;
    // An explicit array (including the empty array) is honored as-is.
    return Array.isArray(parsed) ? (parsed as number[]) : [...fallback];
  } catch {
    // Don't log the raw value — it may be large/garbled. Just flag the column.
    console.warn(`getUserGroupPolicy: malformed JSON in Settings.${column}; treating as empty`);
    return [];
  }
}

export async function getUserGroupPolicy(): Promise<UserGroupPolicy> {
  const row = await prisma.settings.findUnique({ where: { id: "singleton" } });
  // No Settings row at all → defaults. With a row, each tier independently falls
  // back to its default seed when its column is null/unset, but a column holding
  // an explicit "[]" stays empty (admin intentionally emptied that tier).
  if (!row) return { ...DEFAULT_USER_GROUP_POLICY };
  return {
    featured: parseIdColumn(
      row.userGroupFeatured,
      "userGroupFeatured",
      DEFAULT_USER_GROUP_POLICY.featured,
    ),
    secondary: parseIdColumn(
      row.userGroupSecondary,
      "userGroupSecondary",
      DEFAULT_USER_GROUP_POLICY.secondary,
    ),
  };
}

export async function setUserGroupPolicy(
  featured: number[],
  secondary: number[],
): Promise<UserGroupPolicy> {
  const f = JSON.stringify(featured);
  const s = JSON.stringify(secondary);
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { userGroupFeatured: f, userGroupSecondary: s },
    create: { id: "singleton", userGroupFeatured: f, userGroupSecondary: s },
  });
  return { featured, secondary };
}

/** Mark a user as seen now (called on socket connect, not just OAuth login). */
export async function touchLastSeen(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: new Date() },
  });
}

export async function openPresenceSession(userId: string, roomId: string): Promise<string> {
  // Close any existing open sessions for this user (they only occupy one room at a time)
  await prisma.presenceSession.updateMany({
    where: { userId, leftAt: null },
    data: { leftAt: new Date() },
  });
  const session = await prisma.presenceSession.create({
    data: { userId, roomId },
    select: { id: true },
  });
  return session.id;
}

export async function closePresenceSessions(userId: string): Promise<void> {
  await prisma.presenceSession.updateMany({
    where: { userId, leftAt: null },
    data: { leftAt: new Date() },
  });
}

export async function openMeetingSession(userId: string, roomId: string): Promise<string> {
  await prisma.meetingSession.updateMany({
    where: { userId, endedAt: null },
    data: { endedAt: new Date() },
  });
  const session = await prisma.meetingSession.create({
    data: { userId, roomId },
    select: { id: true },
  });
  return session.id;
}

export async function closeMeetingSessions(userId: string): Promise<void> {
  await prisma.meetingSession.updateMany({
    where: { userId, endedAt: null },
    data: { endedAt: new Date() },
  });
}

/**
 * On server startup, close any sessions that were left open when the server last stopped.
 * Sets leftAt/endedAt to the user's lastSeenAt (best guess) to avoid phantom infinite sessions.
 */
export async function closeOrphanedSessions(): Promise<void> {
  const now = new Date();
  await prisma.presenceSession.updateMany({
    where: { leftAt: null },
    data: { leftAt: now },
  });
  await prisma.meetingSession.updateMany({
    where: { endedAt: null },
    data: { endedAt: now },
  });
}
