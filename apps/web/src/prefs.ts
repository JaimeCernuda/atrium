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

export function resolveMode(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}
