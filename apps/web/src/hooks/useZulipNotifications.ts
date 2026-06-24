import { useEffect } from "react";
import type { ChatMessage } from "@atrium/shared";
import { participantKey } from "@atrium/shared";
import { useStore } from "../store";
import { getSocket } from "../socket";
import { notify } from "../notify";
import { sounds } from "../sound";

/**
 * Browser-notification + sound + unread tracking for live Zulip traffic. Fires
 * for new channel messages and DMs that are NOT from the current user and NOT
 * the conversation currently open-and-focused. Channel messages notify only
 * when the tab is unfocused (they're chattier); DMs always notify (more
 * personal), matching how Atrium already treats internal DMs. Per-tag debounce
 * coalesces rapid bursts.
 *
 * Mounted once in AppShell so it runs on every authed page (Office AND /zulip).
 */

const DEBOUNCE_MS = 300;

export function useZulipNotifications(): void {
  useEffect(() => {
    const socket = getSocket();
    const lastNotified = new Map<string, number>();

    // Returns false when this tag fired too recently (drop it).
    const passDebounce = (tag: string): boolean => {
      const now = Date.now();
      const prev = lastNotified.get(tag) ?? 0;
      if (now - prev < DEBOUNCE_MS) return false;
      lastNotified.set(tag, now);
      return true;
    };

    const selfTag = (): string | null => {
      const id = useStore.getState().zulipSelfId;
      return id != null ? `zulip:${id}` : null;
    };

    const onMessage = ({
      channelId,
      topicName,
      message,
    }: {
      channelId: number;
      topicName: string;
      message: ChatMessage;
    }) => {
      const state = useStore.getState();
      const self = selfTag();
      // Until our own Zulip id is known we can't tell our own messages apart, so
      // don't risk misclassifying a self-message as someone else's — skip it.
      if (self == null) return;
      if (message.sender.id === self) return;

      const key = `${channelId}:${topicName}`;
      const isActive =
        state.zulipActiveChannel === channelId && state.zulipActiveTopic === topicName;
      const focused =
        typeof document !== "undefined" && document.visibilityState === "visible";

      // Track Global-mapped traffic separately for the aggregate header badge.
      // Count it as unread unless the Global tab is open-and-focused.
      const isGlobal =
        state.globalZulipChannelId === channelId &&
        state.globalZulipTopicName === topicName;
      if (isGlobal) {
        const globalOpen = state.chatOpen && state.chatView === "global";
        if (globalOpen && focused) {
          state.removeZulipUnreadGlobal();
        } else {
          state.addZulipUnreadGlobal();
        }
      }

      // The open-and-focused conversation needs no nudge.
      if (isActive && focused) {
        state.removeZulipUnreadTopic(key);
        return;
      }

      state.addZulipUnreadTopic(key);

      const tag = `zulip-topic-${key}`;
      if (!passDebounce(tag)) return;
      const channel = state.zulipChannels.find((c) => c.id === channelId);
      if (state.prefs.notificationsEnabled) {
        notify({
          title: `${message.sender.name} in #${channel?.name ?? channelId} › ${topicName}`,
          body: stripHtml(message.body),
          icon: message.sender.imageUrl,
          tag,
        });
      }
      if (state.prefs.globalChatSoundEnabled) sounds.tap();
    };

    const onDm = ({
      participantKey: key,
      participantIds,
      title,
      message,
    }: {
      participantKey: string;
      participantIds: number[];
      title: string;
      message: ChatMessage;
    }) => {
      const state = useStore.getState();
      const self = selfTag();

      // Bump this conversation to the top of the recent-DM list with the new
      // message — for our OWN sends too, so the list reorders on every message.
      // The server supplies the title so group-DM names never degrade.
      state.updateZulipDmConversation({
        conversationKey: key,
        participantIds,
        title,
        lastMessage: message,
        lastMessageTs: message.createdAt,
      });

      // Same self-guard as channel messages: don't notify until we can reliably
      // distinguish our own outgoing DMs from incoming ones.
      if (self == null) return;
      if (message.sender.id === self) return;

      const activeKey = state.zulipActiveDmParticipants
        ? participantKey(state.zulipActiveDmParticipants)
        : null;
      const isActive = activeKey === key;
      const focused =
        typeof document !== "undefined" && document.visibilityState === "visible";

      if (isActive && focused) {
        state.removeZulipUnreadDm(key);
        return;
      }

      state.addZulipUnreadDm(key);

      const tag = `zulip-dm-${key}`;
      if (!passDebounce(tag)) return;
      if (state.prefs.notificationsEnabled) {
        notify({
          title: `${message.sender.name} sent you a message`,
          body: stripHtml(message.body),
          icon: message.sender.imageUrl,
          tag,
        });
      }
      if (state.prefs.soundsEnabled) sounds.chime();
    };

    socket.on("zulip:message", onMessage);
    socket.on("zulip:dm", onDm);

    return () => {
      socket.off("zulip:message", onMessage);
      socket.off("zulip:dm", onDm);
    };
  }, []);
}

// Zulip bodies arrive as rendered HTML; the Notification body is plain text, so
// strip tags to a short readable preview.
function stripHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = (div.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}
