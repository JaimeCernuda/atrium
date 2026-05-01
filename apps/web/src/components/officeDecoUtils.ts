import type { OfficeDecoration } from "@atrium/shared";

/** Detect a friendly emoji icon from a link URL hostname */
export function LINK_ICON(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("calendly"))    return "📅";
    if (host.includes("zoom"))        return "🎥";
    if (host.includes("meet.google")) return "🎥";
    if (host.includes("zulip"))       return "💬";
    if (host.includes("slack"))       return "💬";
    if (host.includes("discord"))     return "🎮";
    if (host.includes("teams.microsoft") || host.includes("teams.live")) return "🪟";
    if (host.includes("github"))      return "🐙";
    if (host.includes("gitlab"))      return "🦊";
    if (host.includes("notion"))      return "📝";
    if (host.includes("docs.google")) return "📄";
    if (host.includes("drive.google")) return "📁";
    if (host.includes("cal.com"))     return "📅";
    if (host.includes("linkedin"))    return "💼";
    if (host.includes("twitter") || host.includes("x.com")) return "🐦";
    if (host.includes("youtube"))     return "▶️";
  } catch { /* bad url */ }
  return "🔗";
}

/** Build the MUI sx object for the card background */
export function buildCardBg(deco: OfficeDecoration): Record<string, unknown> {
  if (deco.bgGradient) {
    const { from, to, angle = 135 } = deco.bgGradient;
    const grad = `linear-gradient(${angle}deg, ${from}, ${to})`;
    const pattern = patternOverlay(deco.bgPattern);
    return pattern
      ? { background: `${pattern}, ${grad}` }
      : { background: grad };
  }
  if (deco.bgColor) {
    const pattern = patternOverlay(deco.bgPattern);
    return pattern
      ? { bgcolor: deco.bgColor, backgroundImage: pattern }
      : { bgcolor: deco.bgColor };
  }
  if (deco.bgPattern) {
    return { backgroundImage: patternOverlay(deco.bgPattern) };
  }
  return {};
}

function patternOverlay(pattern?: string): string {
  if (!pattern) return "";
  if (pattern === "dots")
    return "radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px) 0 0 / 14px 14px";
  if (pattern === "stripes")
    return "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,0.1) 6px, rgba(0,0,0,0.1) 12px)";
  if (pattern === "grid")
    return "linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px) 0 0 / 16px 16px";
  return "";
}

/** Build the MUI sx object for the card border */
export function buildBorderSx(deco: OfficeDecoration): Record<string, unknown> {
  const color = deco.accentColor;
  if (!color) return {};
  const style  = deco.borderStyle ?? "solid";
  const width  = deco.borderWidth ?? 4;
  return { borderLeft: `${width}px ${style} ${color}` };
}
