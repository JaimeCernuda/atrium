import { create } from "zustand";
import type {
  ChatMessage,
  PermissionKey,
  PingPayload,
  PresenceUser,
  Room,
  User,
  ZulipChannel,
  ZulipChannelFolder,
  ZulipDmConversation,
  ZulipTopic,
  ZulipUser,
  ZulipUserGroup,
} from "@atrium/shared";
import {
  loadDrawerWidth,
  loadPrefs,
  savePrefs,
  saveDrawerWidth,
  type ThemeMode,
  type UserPrefs,
} from "./prefs";

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
  chatView: "global" | "dm" | "zulip" | "zulip-dm";
  setChatView: (v: "global" | "dm" | "zulip" | "zulip-dm") => void;
  activeDmUser: User | null;
  openDmWith: (user: User) => void;
  closeDm: () => void;

  // ───── Zulip integration ─────
  zulipLinked: boolean;
  zulipEmail: string | null;
  zulipConnected: boolean; // event queue is live
  zulipError: string | null;
  zulipLinking: boolean; // a link request is in flight
  setZulipStatus: (s: { linked: boolean; zulipEmail: string | null }) => void;
  setZulipConnected: (connected: boolean) => void;
  setZulipError: (error: string | null) => void;
  setZulipLinking: (linking: boolean) => void;

  zulipChannels: ZulipChannel[];
  setZulipChannels: (channels: ZulipChannel[]) => void;
  zulipFolders: ZulipChannelFolder[];
  setZulipFolders: (folders: ZulipChannelFolder[]) => void;
  zulipTopicsByChannel: Record<number, ZulipTopic[]>;
  setZulipTopics: (channelId: number, topics: ZulipTopic[]) => void;
  zulipMessagesByTopic: Record<string, ChatMessage[]>; // key: `${channelId}:${topicName}`
  setZulipMessages: (channelId: number, topicName: string, msgs: ChatMessage[]) => void;
  appendZulipMessage: (channelId: number, topicName: string, msg: ChatMessage) => void;

  zulipActiveChannel: number | null;
  zulipActiveTopic: string | null;
  setZulipActiveChannel: (channelId: number | null, topicName: string | null) => void;
  setZulipActiveTopic: (topicName: string | null) => void;

  // ── Zulip DMs (unified direct messages) ──
  zulipSelfId: number | null;
  setZulipSelfId: (id: number | null) => void;
  zulipUsers: ZulipUser[];
  setZulipUsers: (users: ZulipUser[]) => void;
  zulipDmsByParticipants: Record<string, ChatMessage[]>; // key = participantKey(ids)
  setZulipDmMessages: (key: string, msgs: ChatMessage[]) => void;
  appendZulipDmMessage: (key: string, msg: ChatMessage) => void;
  // Rewrite an optimistic (pending) DM message's id to the real Zulip id so the
  // later zulip:dm echo dedupes against it instead of appending a duplicate.
  reconcileZulipDmMessageId: (key: string, fromId: string, toId: string) => void;
  zulipActiveDmParticipants: number[] | null; // full set incl. self
  setZulipActiveDmParticipants: (ids: number[] | null) => void;
  // Recent DM conversations (1:1 + group), most-recent-first. Seeded by the
  // fetch-dm-conversations round-trip; live zulip:dm bumps a row to the top.
  zulipDmConversations: ZulipDmConversation[];
  setZulipDmConversations: (conversations: ZulipDmConversation[]) => void;
  updateZulipDmConversation: (conversation: ZulipDmConversation) => void;
  zulipUserGroups: ZulipUserGroup[];
  setZulipUserGroups: (groups: ZulipUserGroup[]) => void;
  zulipUserGroupPolicy: { featured: number[]; secondary: number[] } | null;
  setZulipUserGroupPolicy: (
    policy: { featured: number[]; secondary: number[] } | null,
  ) => void;
  zulipLinkDialogOpen: boolean;
  setZulipLinkDialogOpen: (open: boolean) => void;

  // ── Global -> Zulip channel+topic mapping ──
  globalZulipChannelId: number | null;
  globalZulipTopicName: string | null;
  setGlobalZulipConfig: (channelId: number | null, topicName: string | null) => void;

  // ── Zulip unread tracking ──
  // Keys: channel topics use `${channelId}:${topicName}`; DMs use participantKey.
  zulipUnreadTopics: Record<string, boolean>;
  zulipUnreadDms: Record<string, boolean>;
  addZulipUnreadTopic: (key: string) => void;
  removeZulipUnreadTopic: (key: string) => void;
  addZulipUnreadDm: (key: string) => void;
  removeZulipUnreadDm: (key: string) => void;
  // Count of unread Global-mapped messages while the Global tab isn't focused.
  zulipUnreadGlobal: number;
  addZulipUnreadGlobal: () => void;
  removeZulipUnreadGlobal: () => void;

  // ── Resizable chat drawer width (px, persisted) ──
  chatPanelWidth: number;
  setChatPanelWidth: (width: number) => void;

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

  // ───── Zulip integration ─────
  zulipLinked: false,
  zulipEmail: null,
  zulipConnected: false,
  zulipError: null,
  zulipLinking: false,
  setZulipStatus: ({ linked, zulipEmail }) => set({ zulipLinked: linked, zulipEmail }),
  setZulipConnected: (zulipConnected) => set({ zulipConnected }),
  setZulipError: (zulipError) => set({ zulipError }),
  setZulipLinking: (zulipLinking) => set({ zulipLinking }),

  zulipChannels: [],
  setZulipChannels: (zulipChannels) => set({ zulipChannels }),
  zulipFolders: [],
  setZulipFolders: (zulipFolders) => set({ zulipFolders }),
  zulipTopicsByChannel: {},
  setZulipTopics: (channelId, topics) =>
    set((state) => ({
      zulipTopicsByChannel: { ...state.zulipTopicsByChannel, [channelId]: topics },
    })),
  zulipMessagesByTopic: {},
  setZulipMessages: (channelId, topicName, msgs) =>
    set((state) => ({
      zulipMessagesByTopic: {
        ...state.zulipMessagesByTopic,
        [`${channelId}:${topicName}`]: msgs,
      },
    })),
  appendZulipMessage: (channelId, topicName, msg) =>
    set((state) => {
      const key = `${channelId}:${topicName}`;
      const prev = state.zulipMessagesByTopic[key] ?? [];
      if (prev.some((m) => m.id === msg.id)) return state;
      return {
        zulipMessagesByTopic: {
          ...state.zulipMessagesByTopic,
          [key]: [...prev, msg].slice(-LIMIT),
        },
      };
    }),

  zulipActiveChannel: null,
  zulipActiveTopic: null,
  setZulipActiveChannel: (zulipActiveChannel, zulipActiveTopic) =>
    set({ zulipActiveChannel, zulipActiveTopic }),
  setZulipActiveTopic: (zulipActiveTopic) => set({ zulipActiveTopic }),

  zulipSelfId: null,
  setZulipSelfId: (zulipSelfId) => set({ zulipSelfId }),
  zulipUsers: [],
  setZulipUsers: (zulipUsers) => set({ zulipUsers }),
  zulipDmsByParticipants: {},
  setZulipDmMessages: (key, msgs) =>
    set((state) => ({
      zulipDmsByParticipants: { ...state.zulipDmsByParticipants, [key]: msgs },
    })),
  appendZulipDmMessage: (key, msg) =>
    set((state) => {
      const prev = state.zulipDmsByParticipants[key] ?? [];
      if (prev.some((m) => m.id === msg.id)) return state;
      return {
        zulipDmsByParticipants: {
          ...state.zulipDmsByParticipants,
          [key]: [...prev, msg].slice(-LIMIT),
        },
      };
    }),
  reconcileZulipDmMessageId: (key, fromId, toId) =>
    set((state) => {
      const prev = state.zulipDmsByParticipants[key];
      if (!prev) return state;
      const idx = prev.findIndex((m) => m.id === fromId);
      if (idx === -1) return state;
      // If the real-id echo already landed, just drop the optimistic placeholder;
      // otherwise rename the placeholder to the real id so the echo dedupes.
      const next = prev.some((m) => m.id === toId)
        ? prev.filter((_, i) => i !== idx)
        : prev.map((m, i) => (i === idx ? { ...m, id: toId } : m));
      return {
        zulipDmsByParticipants: { ...state.zulipDmsByParticipants, [key]: next },
      };
    }),
  zulipActiveDmParticipants: null,
  setZulipActiveDmParticipants: (zulipActiveDmParticipants) =>
    set({ zulipActiveDmParticipants }),
  zulipDmConversations: [],
  setZulipDmConversations: (zulipDmConversations) => set({ zulipDmConversations }),
  updateZulipDmConversation: (updatedConv) =>
    set((state) => {
      const without = state.zulipDmConversations.filter(
        (c) => c.conversationKey !== updatedConv.conversationKey,
      );
      return { zulipDmConversations: [updatedConv, ...without] };
    }),
  zulipUserGroups: [],
  setZulipUserGroups: (zulipUserGroups) => set({ zulipUserGroups }),
  zulipUserGroupPolicy: null,
  setZulipUserGroupPolicy: (zulipUserGroupPolicy) => set({ zulipUserGroupPolicy }),
  zulipLinkDialogOpen: false,
  setZulipLinkDialogOpen: (zulipLinkDialogOpen) => set({ zulipLinkDialogOpen }),

  globalZulipChannelId: null,
  globalZulipTopicName: null,
  setGlobalZulipConfig: (globalZulipChannelId, globalZulipTopicName) =>
    set({ globalZulipChannelId, globalZulipTopicName }),

  zulipUnreadTopics: {},
  zulipUnreadDms: {},
  addZulipUnreadTopic: (key) =>
    set((state) =>
      state.zulipUnreadTopics[key]
        ? state
        : { zulipUnreadTopics: { ...state.zulipUnreadTopics, [key]: true } },
    ),
  removeZulipUnreadTopic: (key) =>
    set((state) => {
      if (!state.zulipUnreadTopics[key]) return state;
      const next = { ...state.zulipUnreadTopics };
      delete next[key];
      return { zulipUnreadTopics: next };
    }),
  addZulipUnreadDm: (key) =>
    set((state) =>
      state.zulipUnreadDms[key]
        ? state
        : { zulipUnreadDms: { ...state.zulipUnreadDms, [key]: true } },
    ),
  removeZulipUnreadDm: (key) =>
    set((state) => {
      if (!state.zulipUnreadDms[key]) return state;
      const next = { ...state.zulipUnreadDms };
      delete next[key];
      return { zulipUnreadDms: next };
    }),

  zulipUnreadGlobal: 0,
  addZulipUnreadGlobal: () =>
    set((state) => ({ zulipUnreadGlobal: state.zulipUnreadGlobal + 1 })),
  removeZulipUnreadGlobal: () =>
    set((state) => (state.zulipUnreadGlobal === 0 ? state : { zulipUnreadGlobal: 0 })),

  chatPanelWidth: loadDrawerWidth(),
  setChatPanelWidth: (width) => {
    saveDrawerWidth(width);
    set({ chatPanelWidth: width });
  },

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

/** Whether a user holds a permission (UI gating only; the server is the backstop). */
export function can(user: User | null, perm: PermissionKey): boolean {
  return Boolean(user?.permissions?.includes(perm));
}

/** Reactive permission check for components. */
export function useHasPermission(perm: PermissionKey): boolean {
  return useStore((s) => can(s.user, perm));
}
