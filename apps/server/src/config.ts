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

export interface Config {
  port: number;
  publicUrl: string;
  rooms: Room[];
  whitelistDomains: string[];
  adminEmails: string[];
  google: GoogleProviderConfig | null;
  microsoft: MicrosoftProviderConfig | null;
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

export function loadConfig(): Config {
  const google = loadGoogle();
  const microsoft = loadMicrosoft();
  if (!google && !microsoft) {
    throw new Error("At least one auth provider must be configured (GOOGLE_* or MICROSOFT_*)");
  }
  return {
    port: Number(process.env.PORT ?? 8090),
    publicUrl: process.env.PUBLIC_URL ?? "http://localhost:5173",
    rooms: loadRooms(process.env.ROOMS_FILE),
    whitelistDomains: parseWhitelist(process.env.WHITELIST_DOMAINS),
    adminEmails: parseWhitelist(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
    google,
    microsoft,
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
