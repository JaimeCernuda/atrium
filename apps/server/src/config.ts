import { readFileSync, existsSync } from "node:fs";
import type { Room } from "@atrium/shared";

export interface GoogleProviderConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export interface MicrosoftProviderConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  tenant: string;
}

export interface ZulipConfig {
  // 64 hex chars (32 bytes) — the key-encryption key for stored Zulip API keys.
  // When this is absent the entire Zulip integration is inert.
  keySecret: string;
}

export interface Config {
  port: number;
  publicUrl: string;
  rooms: Room[];
  defaultRoomId: string | null;
  whitelistDomains: string[];
  adminEmails: string[];
  google: GoogleProviderConfig | null;
  microsoft: MicrosoftProviderConfig | null;
  zulip: ZulipConfig | null;
  session: {
    secret: string;
    cookieName: string;
    maxAge: number;
  };
}

function parseWhitelist(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

function loadRooms(path: string | undefined): Room[] {
  if (!path || !existsSync(path)) {
    return [{ id: "lobby", name: "Lobby", disableMeeting: true, color: "#9e9e9e" }];
  }
  return JSON.parse(readFileSync(path, "utf-8")) as Room[];
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function loadGoogle(): GoogleProviderConfig | null {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:8090/auth/google/callback",
  };
}

function loadMicrosoft(): MicrosoftProviderConfig | null {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) return null;
  return {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackUrl:
      process.env.MICROSOFT_CALLBACK_URL ?? "http://localhost:8090/auth/microsoft/callback",
    tenant: process.env.MICROSOFT_TENANT ?? "common",
  };
}

function loadZulip(): ZulipConfig | null {
  const secret = process.env.ZULIP_KEY_SECRET;
  if (!secret) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    // Misconfigured rather than absent: warn loudly but keep the feature inert
    // instead of crashing the whole server boot.
    console.warn("[zulip] ZULIP_KEY_SECRET must be 64 hex chars; Zulip features disabled");
    return null;
  }
  return { keySecret: secret };
}

function pickDefaultRoom(rooms: Room[]): string | null {
  // Explicit env override wins.
  if (process.env.DEFAULT_ROOM_ID) return process.env.DEFAULT_ROOM_ID;
  // Otherwise match a room whose name case-insensitively starts with "lobby".
  const lobby = rooms.find((r) => r.name.toLowerCase().startsWith("lobby"));
  return lobby?.id ?? null;
}

export function loadConfig(): Config {
  const google = loadGoogle();
  const microsoft = loadMicrosoft();
  if (!google && !microsoft && process.env.NODE_ENV !== "development") {
    throw new Error("At least one auth provider must be configured (GOOGLE_* or MICROSOFT_*)");
  }
  const rooms = loadRooms(process.env.ROOMS_FILE);
  return {
    port: Number(process.env.PORT ?? 8090),
    publicUrl: process.env.PUBLIC_URL ?? "http://localhost:5173",
    rooms,
    defaultRoomId: pickDefaultRoom(rooms),
    whitelistDomains: parseWhitelist(process.env.WHITELIST_DOMAINS),
    adminEmails: parseWhitelist(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
    google,
    microsoft,
    zulip: loadZulip(),
    session: {
      secret: required("SESSION_SECRET"),
      cookieName: process.env.SESSION_COOKIE_NAME ?? "atrium_session",
      maxAge: Number(process.env.SESSION_MAX_AGE_MS ?? 30 * 24 * 60 * 60 * 1000),
    },
  };
}

export function isEmailAllowed(email: string, whitelist: string[]): boolean {
  if (whitelist.length === 0) return true;
  const lower = email.toLowerCase();
  return whitelist.some((entry) => lower.endsWith(entry.toLowerCase()));
}
