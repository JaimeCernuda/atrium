import pkg from "@prisma/client";
const { PrismaClient } = pkg;

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
});

export async function upsertUser(
  user: { id: string; email: string; name: string; imageUrl?: string },
  adminEmails: string[] = [],
): Promise<void> {
  const isAdmin = adminEmails.includes(user.email.toLowerCase());
  await prisma.user.upsert({
    where: { id: user.id },
    // On re-login: refresh email/admin/lastSeen but DO NOT overwrite the
    // user's customized name/imageUrl. Those stick until the user changes
    // them via profile edit / avatar upload.
    update: {
      email: user.email,
      isAdmin,
      lastSeenAt: new Date(),
    },
    create: {
      id: user.id,
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      isAdmin,
      lastSeenAt: new Date(),
    },
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
