// Display helper for people. We show first names only across the floor: presence
// avatars, desk titles, and the DM surfaces. A desk owned by "Hua Xu" shows as
// "Hua"; a group DM shows comma-joined first names. Falls back to the full
// string when there is no whitespace token.

/** The first whitespace-delimited token of a full name ("Hua Xu" -> "Hua"). */
export function firstName(full: string): string {
  const trimmed = (full ?? "").trim();
  if (!trimmed) return trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Comma-join the first names of several people (for group DM titles). */
export function firstNames(fulls: string[]): string {
  return fulls.map(firstName).join(", ");
}
