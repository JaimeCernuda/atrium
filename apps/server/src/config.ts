import { readFileSync, existsSync } from "node:fs";
import type { Room } from "@atrium/shared";

export interface Config {
  port: number;
  publicUrl: string;
  rooms: Room[];
  whitelistDomains: string[];
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
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

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 8090),
    publicUrl: process.env.PUBLIC_URL ?? "http://localhost:5173",
    rooms: loadRooms(process.env.ROOMS_FILE),
    whitelistDomains: parseWhitelist(process.env.WHITELIST_DOMAINS),
    google: {
      clientId: required("GOOGLE_CLIENT_ID"),
      clientSecret: required("GOOGLE_CLIENT_SECRET"),
      callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:8090/auth/google/callback",
    },
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
