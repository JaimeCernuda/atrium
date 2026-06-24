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
 * the conversation the reader is actively looking at. "Actively looking at" is
 * the composite view-state (zulipViewState): the right surface is open, that
 * exact thread is the visible one, AND the tab is focused — see
 * isThreadActiveAndRead. When the drawer is closed, the tab is unfocused, or a
 * different thread is shown, the message COUNTS AS UNREAD and notifies.
 *
 * Channel messages notify only when not actively-read (browser-notif is further
 * suppressed by notify() while the tab is visible, so a focused-but-different
 * channel still pings via sound). DMs always fire (force) since they're personal.
 * Per-tag debounce coalesces rapid bursts.
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

    // Our own Zulip tag, when known. Only used to skip self-sent messages — an
    // unknown self no longer silences ALL notifications (that was the bug that
    // swallowed everything before bootstrap finished).
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
      // Skip only our OWN messages; unknown-self does NOT silence others.
      if (self != null && message.sender.id === self) return;

      const key = `${channelId}:${topicName}`;
      const active = state.isThreadActiveAndRead(key, "channel");
      const focused = state.zulipViewState.tabFocused;

      // Track Global-mapped traffic separately for the aggregate header badge.
      // Count it as unread unless the Global tab is open-and-focused.
      const isGlobal =
        state.globalZulipChannelId === channelId &&
        state.globalZulipTopicName === topicName;
      // Global is its OWN unread source (zulipUnreadGlobal). It must NOT also flow
      // into the channel unread maps, or the same message gets summed twice in the
      // header total and lights up the /zulip badge + folder/channel chips for
      // traffic the user is actively reading in the drawer. Handle it and return.
      if (isGlobal) {
        const v = state.zulipViewState;
        const globalActive = v.tabFocused && v.drawerOpen && v.chatView === "global";
        if (globalActive) {
          state.removeZulipUnreadGlobal();
        } else {
          state.addZulipUnreadGlobal();
          const tag = `zulip-global-${key}`;
          if (passDebounce(tag)) {
            if (state.prefs.notificationsEnabled) {
              notify({
                title: `${message.sender.name} in Global`,
                body: stripHtml(message.body),
                icon: message.sender.imageUrl,
                tag,
              });
            }
            if (state.prefs.globalChatSoundEnabled && !focused) sounds.tap();
          }
        }
        return;
      }

      // The actively-read thread needs no nudge.
      if (active) {
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
      // Channels are chattier, so only ping with sound when the tab is unfocused.
      if (state.prefs.globalChatSoundEnabled && !focused) sounds.tap();
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
      // Zulip message ids are numeric; fall back to 0 for optimistic temp ids
      // (e.g. "pending:…") so ordering still works once the real id arrives.
      const lastMessageId = Number.parseInt(message.id, 10) || 0;
      state.updateZulipDmConversation({
        conversationKey: key,
        participantIds,
        title,
        lastMessage: message,
        lastMessageTs: message.createdAt,
        lastMessageId,
      });

      // Skip only our OWN DMs; unknown-self does NOT silence others.
      if (self != null && message.sender.id === self) return;

      const active = state.isThreadActiveAndRead(key, "dm");

      if (active) {
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
          // DMs are personal — fire even when the tab is visible (but on a
          // different thread).
          force: true,
        });
      }
      if (state.prefs.soundsEnabled) sounds.chime();
    };

    // Zulip-grounded unread snapshot (from /register unread_msgs) — replaces the
    // local maps so counts survive reload + converge across devices.
    const onUnreadSnapshot = (payload: { topics: string[]; dms: string[] }) => {
      useStore.getState().seedZulipUnread(payload);
    };

    socket.on("zulip:message", onMessage);
    socket.on("zulip:dm", onDm);
    socket.on("zulip:unread-snapshot", onUnreadSnapshot);

    return () => {
      socket.off("zulip:message", onMessage);
      socket.off("zulip:dm", onDm);
      socket.off("zulip:unread-snapshot", onUnreadSnapshot);
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
