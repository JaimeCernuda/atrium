import { useEffect } from "react";
import { useStore } from "../store";
import { getSocket } from "../socket";
import { notify } from "../notify";
import { sounds } from "../sound";

/**
 * Fires browser notifications + sounds for:
 *   - user entering the current user's room
 *   - ping received (urgent, always sounds)
 *   - knock received (urgent, always sounds)
 *   - new DM (not sent by self)
 *   - new global message (sound gated by globalChatSoundEnabled)
 */
export function useNotifications(): void {
  useEffect(() => {
    const socket = getSocket();

    const onEnter = ({ user, roomId }: { user: { id: string; name: string; imageUrl?: string }; roomId: string }) => {
      const state = useStore.getState();
      if (!state.prefs.notificationsEnabled) return;
      if (!state.user || user.id === state.user.id) return;
      if (roomId !== state.currentRoomId) return;
      const room = state.rooms.find((r) => r.id === roomId);
      notify({
        title: `${user.name} joined ${room?.name ?? "your room"}`,
        icon: user.imageUrl,
        tag: `enter-${roomId}-${user.id}`,
      });
    };

    const onPing = ({ from, roomId }: { from: { name: string; imageUrl?: string }; roomId: string | null }) => {
      const state = useStore.getState();
      const room = state.rooms.find((r) => r.id === roomId);
      if (state.prefs.notificationsEnabled) {
        notify({
          title: `${from.name} pinged you`,
          body: room ? `from ${room.name}` : "wants to talk",
          icon: from.imageUrl,
          tag: "ping",
          force: true,
          vibrate: true,
        });
      }
      if (state.prefs.soundsEnabled) sounds.chime();
    };

    const onKnock = ({ from, roomId }: { from: { name: string; imageUrl?: string }; roomId: string }) => {
      const state = useStore.getState();
      const room = state.rooms.find((r) => r.id === roomId);
      if (state.prefs.notificationsEnabled) {
        notify({
          title: `${from.name} is knocking`,
          body: room ? `on ${room.name}` : undefined,
          icon: from.imageUrl,
          tag: `knock-${roomId}`,
          force: true,
          vibrate: true,
        });
      }
      if (state.prefs.soundsEnabled) sounds.knock();
    };

    const onDm = (msg: {
      id: string;
      sender: { id: string; name: string; imageUrl?: string };
      body: string;
    }) => {
      const state = useStore.getState();
      if (state.user && msg.sender.id === state.user.id) return;
      if (state.prefs.notificationsEnabled) {
        notify({
          title: `${msg.sender.name} sent you a message`,
          body: msg.body,
          icon: msg.sender.imageUrl,
          tag: `dm-${msg.sender.id}`,
        });
      }
      if (state.prefs.soundsEnabled) sounds.chime();
    };

    const onGlobal = (msg: { sender: { id: string } }) => {
      const state = useStore.getState();
      if (state.user && msg.sender.id === state.user.id) return;
      if (state.prefs.globalChatSoundEnabled) sounds.tap();
    };

    socket.on("presence:enter", onEnter);
    socket.on("ping:received", onPing);
    socket.on("knock:received", onKnock);
    socket.on("chat:dm", onDm);
    socket.on("chat:global", onGlobal);

    return () => {
      socket.off("presence:enter", onEnter);
      socket.off("ping:received", onPing);
      socket.off("knock:received", onKnock);
      socket.off("chat:dm", onDm);
      socket.off("chat:global", onGlobal);
    };
  }, []);
}
