import { useEffect, useState } from "react";
import type { ChatMessage, GlobalChatConfig, Room, User, ZulipLinkStatus } from "@atrium/shared";
import { useStore } from "../store";
import { getSocket } from "../socket";

export function useBootstrap(): { loading: boolean } {
  const [loading, setLoading] = useState(true);
  const setBrand = useStore((s) => s.setBrand);
  const setDefaultRoomId = useStore((s) => s.setDefaultRoomId);
  const setUser = useStore((s) => s.setUser);
  const setRooms = useStore((s) => s.setRooms);
  const setPresence = useStore((s) => s.setPresence);
  const addPresence = useStore((s) => s.addPresence);
  const removePresence = useStore((s) => s.removePresence);
  const setMeetingFlag = useStore((s) => s.setMeetingFlag);
  const setGlobalMessages = useStore((s) => s.setGlobalMessages);
  const appendGlobalMessage = useStore((s) => s.appendGlobalMessage);
  const appendDmMessage = useStore((s) => s.appendDmMessage);
  const setActivePing = useStore((s) => s.setActivePing);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const brandRes = await fetch("/api/config");
      if (brandRes.ok && !cancelled) {
        const body = (await brandRes.json()) as {
          brand: ReturnType<typeof useStore.getState>["brand"];
          defaultRoomId: string | null;
        };
        setBrand(body.brand);
        setDefaultRoomId(body.defaultRoomId ?? null);
      }

      const meRes = await fetch("/api/me", { credentials: "include" });
      if (!meRes.ok) {
        if (!cancelled) setLoading(false);
        return;
      }
      const user = (await meRes.json()) as User;
      if (cancelled) return;
      setUser(user);

      const roomsRes = await fetch("/api/rooms", { credentials: "include" });
      if (roomsRes.ok && !cancelled) {
        setRooms((await roomsRes.json()) as Room[]);
      }

      const chatRes = await fetch("/api/chat/global", { credentials: "include" });
      if (chatRes.ok && !cancelled) {
        setGlobalMessages((await chatRes.json()) as ChatMessage[]);
      }

      const zulipRes = await fetch("/api/zulip/status", { credentials: "include" });
      if (zulipRes.ok && !cancelled) {
        const status = (await zulipRes.json()) as ZulipLinkStatus;
        useStore.getState().setZulipStatus({
          linked: status.linked,
          zulipEmail: status.zulipEmail,
        });
        useStore.getState().setZulipSelfId(status.zulipUserId ?? null);
      }

      // Seed the Global -> Zulip channel+topic mapping so the client knows which
      // live zulip:message events to mirror into the Global view.
      const globalCfgRes = await fetch("/api/admin/global-settings", { credentials: "include" });
      if (globalCfgRes.ok && !cancelled) {
        const cfg = (await globalCfgRes.json()) as GlobalChatConfig;
        useStore.getState().setGlobalZulipConfig(cfg.channelId, cfg.topicName);
      }

      const socket = getSocket();
      socket.on("presence:snapshot", (state) => {
        setPresence(state);
        // Sync currentRoomId if the snapshot shows us placed somewhere.
        const meId = useStore.getState().user?.id;
        let placed = false;
        if (meId) {
          for (const [rid, usersInRoom] of Object.entries(state)) {
            if (usersInRoom.some((u) => u.id === meId)) {
              useStore.getState().setCurrentRoomId(rid);
              placed = true;
              break;
            }
          }
        }
        // If we're logged in but not in any room, auto-join the default
        // (Lobby). Matches the real-office metaphor: logging in = walking
        // in the door. Safe to re-run; server ignores joins for the room
        // you're already in.
        const defaultRoomId = useStore.getState().defaultRoomId;
        if (!placed && meId && defaultRoomId) {
          socket.emit("presence:join", defaultRoomId);
          useStore.getState().setCurrentRoomId(defaultRoomId);
        }
      });
      socket.on("presence:enter", ({ user, roomId }) => {
        addPresence(roomId, user);
        const meId = useStore.getState().user?.id;
        if (meId && user.id === meId) {
          useStore.getState().setCurrentRoomId(roomId);
        }
      });
      socket.on("presence:leave", ({ userId, roomId }) => {
        removePresence(roomId, userId);
        const me = useStore.getState().user;
        if (me && userId === me.id && useStore.getState().currentRoomId === roomId) {
          useStore.getState().setCurrentRoomId(null);
        }
      });
      socket.on("presence:meeting", ({ userId, inMeeting }) => setMeetingFlag(userId, inMeeting));
      socket.on("chat:global", appendGlobalMessage);
      socket.on("chat:dm", appendDmMessage);
      socket.on("ping:received", setActivePing);
      socket.on("user:updated", (u) => useStore.getState().patchUserEverywhere(u));

      // Zulip listeners — registered BEFORE connect so no early event is lost.
      socket.on("zulip:connected", () => {
        const store = useStore.getState();
        store.setZulipConnected(true);
        store.setZulipError(null);
        // Fetch channels + org members only once the queue is live; emitting
        // before connect would be dropped (autoConnect is off until connect()).
        socket.emit("zulip:fetch-channels");
        socket.emit("zulip:fetch-users");
        // Re-fetch global history now that the user's Zulip queue exists. The
        // bootstrap GET above ran before socket.connect(), so the server had no
        // live ZulipQueueClient and fell back to the internal Message table even
        // when Global is mapped to a Zulip channel+topic. Re-fetching here loads
        // the real Zulip-backed history for a linked user.
        fetch("/api/chat/global", { credentials: "include" })
          .then((r) => (r.ok ? (r.json() as Promise<ChatMessage[]>) : null))
          .then((msgs) => {
            if (msgs) useStore.getState().setGlobalMessages(msgs);
          })
          .catch((err) => console.error(err));
        // Load the org's user-group visibility policy so the DM list renders the
        // configured grouping on first paint (readable by any authed user).
        fetch("/api/admin/user-group-policy", { credentials: "include" })
          .then((r) =>
            r.ok
              ? (r.json() as Promise<{ policy: { featured: number[]; secondary: number[] } }>)
              : null,
          )
          .then((data) => {
            if (data?.policy) useStore.getState().setZulipUserGroupPolicy(data.policy);
          })
          .catch((err) => console.error(err));
      });
      socket.on("zulip:disconnected", () => useStore.getState().setZulipConnected(false));
      socket.on("zulip:error", ({ message }) => useStore.getState().setZulipError(message));
      socket.on("zulip:channels", ({ channels, folders }) => {
        useStore.getState().setZulipChannels(channels);
        useStore.getState().setZulipFolders(folders ?? []);
      });
      socket.on("zulip:topics", ({ channelId, topics }) =>
        useStore.getState().setZulipTopics(channelId, topics),
      );
      socket.on("zulip:message", ({ channelId, topicName, message }) => {
        const s = useStore.getState();
        s.appendZulipMessage(channelId, topicName, message);
        // Mirror into the Global view when this channel+topic is the configured
        // Global mapping (reuses the existing global message path, no new event).
        if (channelId === s.globalZulipChannelId && topicName === s.globalZulipTopicName) {
          s.appendGlobalMessage(message);
        }
      });
      socket.on("zulip:users", ({ users }) => useStore.getState().setZulipUsers(users));
      socket.on("zulip:user-groups", ({ groups }) =>
        useStore.getState().setZulipUserGroups(groups),
      );
      socket.on("zulip:dm", ({ participantKey, message }) =>
        useStore.getState().appendZulipDmMessage(participantKey, message),
      );

      socket.connect();

      if (!cancelled) setLoading(false);
    })().catch((err) => {
      console.error(err);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    setBrand,
    setUser,
    setRooms,
    setPresence,
    addPresence,
    removePresence,
    setMeetingFlag,
    setGlobalMessages,
    appendGlobalMessage,
    appendDmMessage,
    setActivePing,
  ]);

  return { loading };
}
