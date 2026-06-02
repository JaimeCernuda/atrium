export interface Room {
  id: string;
  name: string;
  color?: string;
  category?: string;
  disableMeeting?: boolean;
  externalMeetUrl?: string;
  ownerEmail?: string;
  locked?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  imageUrl?: string;
  isAdmin?: boolean;
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
}

export interface FundingList {
  active: FundingGrant[];
  completed: FundingGrant[];
}

export type SubmissionKind = "paper" | "poster";
export type SubmissionStatus = "received" | "delivering" | "delivered" | "failed";

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
