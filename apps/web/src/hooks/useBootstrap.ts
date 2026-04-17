import { useEffect, useState } from "react";
import type { ChatMessage, Room, User } from "@atrium/shared";
import { useStore } from "../store";
import { getSocket } from "../socket";

export function useBootstrap(): { loading: boolean } {
  const [loading, setLoading] = useState(true);
  const setBrand = useStore((s) => s.setBrand);
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
        const body = (await brandRes.json()) as { brand: ReturnType<typeof useStore.getState>["brand"] };
        setBrand(body.brand);
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

      const socket = getSocket();
      socket.on("presence:snapshot", (state) => {
        setPresence(state);
        // Sync currentRoomId if the snapshot shows us placed somewhere.
        const meId = useStore.getState().user?.id;
        if (meId) {
          for (const [rid, usersInRoom] of Object.entries(state)) {
            if (usersInRoom.some((u) => u.id === meId)) {
              useStore.getState().setCurrentRoomId(rid);
              break;
            }
          }
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
