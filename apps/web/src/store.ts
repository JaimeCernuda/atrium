import { create } from "zustand";
import type { ChatMessage, PingPayload, PresenceUser, Room, User } from "@atrium/shared";
import { loadPrefs, savePrefs, type ThemeMode, type UserPrefs } from "./prefs";

interface AtriumState {
  brand: { name: string; shortName?: string; logoUrl?: string; accentColor: string };
  setBrand: (b: AtriumState["brand"]) => void;

  defaultRoomId: string | null;
  setDefaultRoomId: (id: string | null) => void;

  user: User | null;
  setUser: (u: User | null) => void;

  rooms: Room[];
  setRooms: (r: Room[]) => void;

  currentRoomId: string | null;
  setCurrentRoomId: (id: string | null) => void;

  presence: Record<string, PresenceUser[]>;
  setPresence: (p: Record<string, PresenceUser[]>) => void;
  addPresence: (roomId: string, user: PresenceUser) => void;
  removePresence: (roomId: string, userId: string) => void;
  setMeetingFlag: (userId: string, inMeeting: boolean) => void;

  globalMessages: ChatMessage[];
  setGlobalMessages: (msgs: ChatMessage[]) => void;
  appendGlobalMessage: (msg: ChatMessage) => void;

  dmByUser: Record<string, ChatMessage[]>;
  setDmMessages: (userId: string, msgs: ChatMessage[]) => void;
  appendDmMessage: (msg: ChatMessage) => void;

  activePing: PingPayload | null;
  setActivePing: (p: PingPayload | null) => void;

  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  chatView: "global" | "dm";
  setChatView: (v: "global" | "dm") => void;
  activeDmUser: User | null;
  openDmWith: (user: User) => void;
  closeDm: () => void;

  patchUserEverywhere: (user: User) => void;

  prefs: UserPrefs;
  setThemeMode: (mode: ThemeMode) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSoundsEnabled: (enabled: boolean) => void;
  setGlobalChatSoundEnabled: (enabled: boolean) => void;
}

const LIMIT = 200;

export const useStore = create<AtriumState>((set) => ({
  brand: { name: "Atrium", accentColor: "#1976d2" },
  setBrand: (brand) => set({ brand }),

  defaultRoomId: null,
  setDefaultRoomId: (id) => set({ defaultRoomId: id }),

  user: null,
  setUser: (user) => set({ user }),

  rooms: [],
  setRooms: (rooms) => set({ rooms }),

  currentRoomId: null,
  setCurrentRoomId: (currentRoomId) => set({ currentRoomId }),

  presence: {},
  setPresence: (presence) => set({ presence }),
  addPresence: (roomId, user) =>
    set((state) => {
      const without = Object.fromEntries(
        Object.entries(state.presence).map(([rid, users]) => [
          rid,
          users.filter((u) => u.id !== user.id),
        ]),
      );
      return { presence: { ...without, [roomId]: [...(without[roomId] ?? []), user] } };
    }),
  removePresence: (roomId, userId) =>
    set((state) => ({
      presence: {
        ...state.presence,
        [roomId]: (state.presence[roomId] ?? []).filter((u) => u.id !== userId),
      },
    })),
  setMeetingFlag: (userId, inMeeting) =>
    set((state) => ({
      presence: Object.fromEntries(
        Object.entries(state.presence).map(([rid, users]) => [
          rid,
          users.map((u) => (u.id === userId ? { ...u, inMeeting } : u)),
        ]),
      ),
    })),

  globalMessages: [],
  setGlobalMessages: (globalMessages) => set({ globalMessages }),
  appendGlobalMessage: (msg) =>
    set((state) => {
      if (state.globalMessages.some((m) => m.id === msg.id)) return state;
      return { globalMessages: [...state.globalMessages, msg].slice(-LIMIT) };
    }),

  dmByUser: {},
  setDmMessages: (userId, msgs) =>
    set((state) => ({ dmByUser: { ...state.dmByUser, [userId]: msgs } })),
  appendDmMessage: (msg) =>
    set((state) => {
      const me = state.user;
      if (!me) return state;
      const otherId = msg.sender.id === me.id ? msg.recipientId : msg.sender.id;
      if (!otherId) return state;
      const prev = state.dmByUser[otherId] ?? [];
      if (prev.some((m) => m.id === msg.id)) return state;
      return { dmByUser: { ...state.dmByUser, [otherId]: [...prev, msg].slice(-LIMIT) } };
    }),

  activePing: null,
  setActivePing: (activePing) => set({ activePing }),

  chatOpen: false,
  setChatOpen: (chatOpen) => set({ chatOpen }),
  chatView: "global",
  setChatView: (chatView) => set({ chatView }),
  activeDmUser: null,
  openDmWith: (u) => set({ chatOpen: true, chatView: "dm", activeDmUser: u }),
  closeDm: () => set({ activeDmUser: null }),

  patchUserEverywhere: (u) =>
    set((state) => ({
      user: state.user?.id === u.id ? { ...state.user, ...u } : state.user,
      presence: Object.fromEntries(
        Object.entries(state.presence).map(([rid, users]) => [
          rid,
          users.map((pu) => (pu.id === u.id ? { ...pu, name: u.name, imageUrl: u.imageUrl } : pu)),
        ]),
      ),
      globalMessages: state.globalMessages.map((m) =>
        m.sender.id === u.id ? { ...m, sender: { ...m.sender, name: u.name, imageUrl: u.imageUrl } } : m,
      ),
      dmByUser: Object.fromEntries(
        Object.entries(state.dmByUser).map(([uid, msgs]) => [
          uid,
          msgs.map((m) =>
            m.sender.id === u.id ? { ...m, sender: { ...m.sender, name: u.name, imageUrl: u.imageUrl } } : m,
          ),
        ]),
      ),
    })),

  prefs: loadPrefs(),
  setThemeMode: (mode) =>
    set((state) => {
      const next = { ...state.prefs, themeMode: mode };
      savePrefs(next);
      return { prefs: next };
    }),
  setNotificationsEnabled: (enabled) =>
    set((state) => {
      const next = { ...state.prefs, notificationsEnabled: enabled };
      savePrefs(next);
      return { prefs: next };
    }),
  setSoundsEnabled: (enabled) =>
    set((state) => {
      const next = { ...state.prefs, soundsEnabled: enabled };
      savePrefs(next);
      return { prefs: next };
    }),
  setGlobalChatSoundEnabled: (enabled) =>
    set((state) => {
      const next = { ...state.prefs, globalChatSoundEnabled: enabled };
      savePrefs(next);
      return { prefs: next };
    }),
}));

// Helper for consumers that aren't React components
export function getState(): ReturnType<typeof useStore.getState> {
  return useStore.getState();
}
