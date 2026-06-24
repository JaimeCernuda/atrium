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
  zulipStreamId?: number;
  zulipStreamIds?: number[];
  // A "Papers" research room superseded by a per-student desk is hidden from the
  // floorplan (reversible, never deleted) — see layout.ts zoneFor().
  superseded?: boolean;
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

// ───── Zulip integration ─────
export interface ZulipLinkStatus {
  linked: boolean;
  zulipEmail: string | null;
  zulipUserId?: number;
  linkedAt?: string; // ISO
}

export interface ZulipChannel {
  id: number;          // Zulip stream_id
  name: string;        // stream name (canonical key for narrows + sending)
  display_name: string;// description or name, for UI
  subscribed: boolean;
  // Zulip 11+ channel-folder membership. null/undefined => ungrouped ("Other").
  folderId?: number | null;
}

/** A Zulip channel folder/category (Zulip 11+). Channels carry `folderId`. */
export interface ZulipChannelFolder {
  id: number;
  name: string;
  order?: number; // Zulip's display order; lower sorts first
}

export interface ZulipTopic {
  name: string;
  maxId: number; // max message id in topic
  lastActivityTime?: string; // ISO; optional, may be absent
}

/** A Zulip org member, matched to an Atrium user by email when one exists. */
export interface ZulipUser {
  zulipUserId: number;
  atriumUserId: string | null; // null = in Zulip but not (yet) an Atrium user
  name: string;
  email: string;
  imageUrl?: string;
}

/** A custom Zulip user group (system "role:*" groups are excluded server-side). */
export interface ZulipUserGroup {
  id: number;
  name: string;
  description: string;
  memberIds: number[];
}

/** Org-wide mapping of the Atrium "Global" chat onto one Zulip channel+topic. */
export interface GlobalChatConfig {
  channelId: number | null;
  topicName: string | null;
}

/**
 * One row in the user's recent direct-message list — a 1:1 or group DM,
 * keyed by the full participant set. `title` is the other participants'
 * names joined by ", "; the client renders this list most-recent-first.
 */
export interface ZulipDmConversation {
  conversationKey: string; // participantKey(full participant set incl. self)
  participantIds: number[]; // sorted numeric ids, including self
  title: string; // "Alice" (1:1) or "Alice, Bob, Carol" (group)
  // Newest message in the conversation. Optional: conversations surfaced ONLY
  // by Zulip's recent_private_conversations (i.e. older than the recent-message
  // window) carry no snippet — just a title and ordering id. Rows backed by a
  // fetched message always have both.
  lastMessage?: ChatMessage;
  lastMessageTs?: string; // ISO timestamp of lastMessage, when known
  // Zulip message id used as a stable ordering key, always present. For
  // window-backed rows this is the last message's id; for snippet-less rows it
  // is recent_private_conversations' max_message_id.
  lastMessageId: number;
}

/**
 * Canonical key for a direct-message conversation: the FULL participant set
 * (including the current user), as sorted numeric Zulip ids joined by ",".
 * Load-bearing: server dispatch, server send-echo, and the web store must all
 * derive the same key for a conversation or messages will split.
 */
export function participantKey(ids: number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}

// Zulip messages are surfaced as the existing ChatMessage shape so the
// frontend MessageList renders them unchanged. createdAt is ISO (server
// converts Zulip's epoch-seconds). id is the Zulip message id as a string.
export interface ZulipMessagePayload {
  channelId: number;
  topicName: string;
  message: ChatMessage;
}

export interface ZulipReactionPayload {
  channelId: number;
  topicName: string;
  messageId: number;
  emojiName: string;
  userId: number;
  op: "add" | "remove";
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

  "zulip:connected": () => void;
  "zulip:disconnected": () => void;
  "zulip:error": (payload: { message: string }) => void;
  "zulip:channels": (payload: {
    channels: ZulipChannel[];
    folders: ZulipChannelFolder[];
  }) => void;
  "zulip:topics": (payload: { channelId: number; topics: ZulipTopic[] }) => void;
  "zulip:message": (payload: ZulipMessagePayload) => void;
  "zulip:reaction": (payload: ZulipReactionPayload) => void;
  "zulip:users": (payload: { users: ZulipUser[] }) => void;
  "zulip:user-groups": (payload: { groups: ZulipUserGroup[] }) => void;
  "zulip:dm": (payload: {
    participantKey: string;
    participantIds: number[];
    title: string;
    message: ChatMessage;
  }) => void;
  "zulip:fetch-dm-conversations": (payload: {
    conversations: ZulipDmConversation[];
  }) => void;
  // Zulip-grounded unread state from /register's unread_msgs. Keys: channel
  // topics `${channelId}:${topicName}`, DMs participantKey. Replaces local maps.
  "zulip:unread-snapshot": (payload: { topics: string[]; dms: string[] }) => void;
  // Best-effort live read-flag sync: keys that Zulip marked read elsewhere.
  "zulip:read-flags": (payload: { topics?: string[]; dms?: string[] }) => void;
};

export type ClientToServerEvents = {
  "presence:join": (roomId: string) => void;
  "presence:meeting-start": () => void;
  "presence:meeting-end": () => void;

  "ping:send": (targetUserId: string) => void;
  "knock:send": (roomId: string) => void;

  "zulip:fetch-channels": (
    cb?: (err: string | null, channels?: ZulipChannel[]) => void,
  ) => void;
  "zulip:fetch-topics": (
    channelId: number,
    cb?: (err: string | null, topics?: ZulipTopic[]) => void,
  ) => void;
  "zulip:fetch-history": (
    params: { channelId: number; topicName: string; numBefore?: number },
    cb?: (err: string | null, messages?: ChatMessage[]) => void,
  ) => void;
  "zulip:send": (
    params: { channelId: number; topicName: string; body: string },
    cb?: (err: string | null, result?: { id: number }) => void,
  ) => void;
  "zulip:fetch-users": (
    cb?: (err: string | null, users?: ZulipUser[]) => void,
  ) => void;
  "zulip:send-dm": (
    params: { participantIds: number[]; body: string },
    cb?: (err: string | null, result?: { id: number }) => void,
  ) => void;
  "zulip:fetch-dm-history": (
    params: { participantIds: number[]; numBefore?: number },
    cb?: (err: string | null, messages?: ChatMessage[]) => void,
  ) => void;
  "zulip:fetch-dm-conversations": (
    cb?: (err: string | null, conversations?: ZulipDmConversation[]) => void,
  ) => void;
  // Mark a viewed thread read on Zulip so unread_msgs stays in sync across
  // devices and a re-register snapshot doesn't resurrect it as unread.
  "zulip:mark-read": (
    payload:
      | { kind: "topic"; channelId: number; topicName: string }
      | { kind: "dm"; participantIds: number[] },
  ) => void;
};
