export type ThemeMode = "light" | "dark" | "system";

export interface UserPrefs {
  themeMode: ThemeMode;
  notificationsEnabled: boolean;
  soundsEnabled: boolean; // pings, knocks, DMs
  globalChatSoundEnabled: boolean; // global channel chatter
}

const KEY = "atrium:prefs";

const defaults: UserPrefs = {
  themeMode: "system",
  notificationsEnabled: false,
  soundsEnabled: true,
  globalChatSoundEnabled: false,
};

export function loadPrefs(): UserPrefs {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<UserPrefs>) };
  } catch {
    return defaults;
  }
}

export function savePrefs(prefs: UserPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(prefs));
}

// ── Chat drawer width ──
// Persisted separately from UserPrefs since it's a raw pixel value driven by a
// drag handle, not a toggle. Clamped to a sane range so a stale/garbage value
// can never wedge the drawer off-screen.
const DRAWER_WIDTH_KEY = "atrium:drawer-width";
export const DRAWER_WIDTH_MIN = 280;
export const DRAWER_WIDTH_MAX = 600;
export const DRAWER_WIDTH_DEFAULT = 360;

export function clampDrawerWidth(n: number): number {
  if (!Number.isFinite(n)) return DRAWER_WIDTH_DEFAULT;
  return Math.min(DRAWER_WIDTH_MAX, Math.max(DRAWER_WIDTH_MIN, Math.round(n)));
}

export function loadDrawerWidth(): number {
  if (typeof window === "undefined") return DRAWER_WIDTH_DEFAULT;
  try {
    const raw = localStorage.getItem(DRAWER_WIDTH_KEY);
    if (!raw) return DRAWER_WIDTH_DEFAULT;
    return clampDrawerWidth(Number(raw));
  } catch {
    return DRAWER_WIDTH_DEFAULT;
  }
}

export function saveDrawerWidth(n: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DRAWER_WIDTH_KEY, String(clampDrawerWidth(n)));
}

export function resolveMode(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}
