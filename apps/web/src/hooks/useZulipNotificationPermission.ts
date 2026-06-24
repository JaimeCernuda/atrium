import { useEffect } from "react";
import { requestPermission, supportsNotifications } from "../notify";

/**
 * Requests browser-notification permission once on mount, if it hasn't been
 * decided yet. This was the missing piece that left Zulip notifications silent:
 * nothing in the app ever prompted for permission, so notify() always bailed at
 * the `Notification.permission !== "granted"` guard. Mounted once in AppShell.
 */
export function useZulipNotificationPermission(): void {
  useEffect(() => {
    if (!supportsNotifications()) return;
    if (Notification.permission === "default") {
      requestPermission().catch(() => {});
    }
  }, []);
}
