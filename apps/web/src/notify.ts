export interface NotifyOptions {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
  /**
   * If true, always fire even when the tab is visible.
   * Default false (suppress when focused so you don't see dupes of in-app UI).
   */
  force?: boolean;
  /** Emit a vibration pulse on mobile. */
  vibrate?: boolean;
}

export function supportsNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!supportsNotifications()) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

export function notify(opts: NotifyOptions): void {
  if (!supportsNotifications()) return;
  if (Notification.permission !== "granted") return;
  if (!opts.force && typeof document !== "undefined" && document.visibilityState === "visible") return;

  const init: NotificationOptions = { body: opts.body, icon: opts.icon, tag: opts.tag };
  if (opts.vibrate && "vibrate" in init) {
    (init as unknown as { vibrate: number[] }).vibrate = [200, 80, 200];
  }

  const n = new Notification(opts.title, init);
  if (opts.onClick) {
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
  }
}
