export interface OfficeLink {
  id: string;
  label: string;
  url: string;
}

export interface OfficeDecoration {
  // Background
  bgColor?: string;
  bgGradient?: { from: string; to: string; angle?: number };
  bgPattern?: "dots" | "stripes" | "grid";

  // Border
  accentColor?: string;
  borderStyle?: "solid" | "dashed" | "dotted";
  borderWidth?: 2 | 4 | 6;
  glow?: boolean;

  // Labels
  emoji?: string;
  badge?: string;
  badgeColor?: string;
  motto?: string;

  // Room name styling
  nameColor?: string;
  nameUppercase?: boolean;
  nameItalic?: boolean;

  // Pinned links (max 8)
  links?: OfficeLink[];
}

export interface Room {
  id: string;
  name: string;
  color?: string;
  category?: string;
  disableMeeting?: boolean;
  externalMeetUrl?: string;
  ownerEmail?: string;
  locked?: boolean;
  decorations?: OfficeDecoration;
}

/**
 * Permission vocabulary. Keys are code-defined (they map to server enforcement
 * points); which roles HOLD each permission is DB data editable at /admin/roles.
 * The server's PERMISSION_KEYS list (apps/server/src/permissions.ts) is the
 * runtime source of truth; the web reads it from GET /api/roles `allKeys`.
 */
export type PermissionKey =
  | "manage_rooms"
  | "manage_members"
  | "manage_roles"
  | "manage_bots"
  | "view_metrics"
  | "view_all_submissions"
  | "submit"
  | "create_reminders"
  | "write_digest"
  | "own_office";

export interface RoleInfo {
  id: string;
  name: string;
  permissions: PermissionKey[];
  sortOrder: number;
  isProtected: boolean;
  memberCount: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  imageUrl?: string;
  isAdmin?: boolean; // deprecated: equivalent to role === "owner"; kept for back-compat
  role?: string;
  permissions?: PermissionKey[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  role: string;
  roleName: string;
  createdAt: string;
  lastSeenAt: string | null;
  office: { id: string; name: string } | null;
  submissionCount: number;
}

export interface PresenceUser extends User {
  socketId: string;
  inMeeting: boolean;
}

export interface PresenceEvent {
  user: PresenceUser;
  roomId: string;
}

export interface ChatMessage {
  id: string;
  sender: User;
  recipientId: string | null;
  body: string;
  createdAt: string;
}

export interface PingPayload {
  from: User;
  roomId: string | null;
}

export interface KnockPayload {
  from: User;
  roomId: string;
}

export interface DigestSummary {
  date: string;
  title: string | null;
  createdAt: string;
}

export interface Digest {
  date: string;
  markdown: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  shareToken?: string;
}

export type ReminderCategory = "deadline" | "event" | "admin" | "other";

export interface Reminder {
  id: string;
  title: string;
  body: string | null;
  dueAt: string;
  category: ReminderCategory;
  createdById: string | null;
  createdByBotId: string | null;
  createdByName: string;
  createdByBot: boolean;
  createdAt: string;
}

export interface BotTokenInfo {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface BotTokenCreated extends BotTokenInfo {
  token: string;
}

export interface FundingGrant {
  project: string;
  grant: string;
  agency: string;
  title: string;
  /** Acknowledgment-generator fields (optional; absent ones fall back to parsing `grant`). */
  org?: "NSF" | "DOE"; // funding organization
  office?: string; // full office text, e.g. "Office of Advanced Cyberinfrastructure (OAC)"
  instrument?: "grant" | "award" | "contract"; // -> "Grant No(s)." / "Award Number(s)" / "Contract(s)"
  awardId?: string; // identifier listed in the ack, e.g. "2411318" or "DE-SC0023263"
}

export interface FundingList {
  active: FundingGrant[];
  completed: FundingGrant[];
}

export type SubmissionKind = "paper" | "poster";
export type SubmissionStatus = "received" | "delivering" | "delivered" | "failed";

/**
 * NSF cyberinfrastructure testbeds the lab uses. Tagged per submission so we can
 * report usage and confirm proper acknowledgement. Delta and DeltaAI are distinct
 * resources (separate NSF awards) and must never be collapsed into one tag.
 */
export const SUBMISSION_RESOURCES = ["Chameleon", "Delta", "DeltaAI"] as const;
export type SubmissionResource = (typeof SUBMISSION_RESOURCES)[number];

export interface SubmissionFile {
  role: string; // "pdf" | "source" | "bib" | "cite" | "slides-pptx" | "slides-pdf" | "poster" | "abstract"
  filename: string; // renamed-from-key, e.g. tang2026.pdf
  publicUrl: string | null; // set once delivered to babbage2
}

export interface Submission {
  id: string;
  kind: SubmissionKind;
  citationKey: string;
  title: string;
  authors: string;
  venue: string;
  year: number;
  pubType: string | null;
  funding: string;
  resources: SubmissionResource[];
  githubUrl: string;
  doi: string | null;
  abstract: string;
  notes: string | null;
  submitterName: string;
  submitterEmail: string;
  files: SubmissionFile[];
  stage: string;
  status: SubmissionStatus;
  deliveryLog: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ServerToClientEvents = {
  "presence:snapshot": (state: Record<string, PresenceUser[]>) => void;
  "presence:enter": (evt: PresenceEvent) => void;
  "presence:leave": (payload: { userId: string; roomId: string }) => void;
  "presence:meeting": (payload: { userId: string; inMeeting: boolean }) => void;
  "user:updated": (user: User) => void;

  "chat:global": (message: ChatMessage) => void;
  "chat:dm": (message: ChatMessage) => void;

  "ping:received": (payload: PingPayload) => void;
  "knock:received": (payload: KnockPayload) => void;
};

export type ClientToServerEvents = {
  "presence:join": (roomId: string) => void;
  "presence:meeting-start": () => void;
  "presence:meeting-end": () => void;

  "ping:send": (targetUserId: string) => void;
  "knock:send": (roomId: string) => void;
};
