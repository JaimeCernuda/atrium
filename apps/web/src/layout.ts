import type { Room } from "@atrium/shared";

export type Zone = "entry" | "research" | "offices" | "meetings" | "status" | "other";

export interface ZoneDef {
  id: Zone;
  label: string;
}

export const ZONES: ZoneDef[] = [
  { id: "entry", label: "Entry" },
  { id: "research", label: "Research" },
  { id: "offices", label: "Offices" },
  { id: "meetings", label: "Meeting rooms" },
  { id: "status", label: "Where else" },
];

const ENTRY_NAMES = /^(lobby|kitchen|lounge|break ?room|coffee)$/i;
const MEETING_NAMES = /(war room|1[:-]?1|meeting|conference|huddle)/i;
const STATUS_NAMES = /^(class|classroom|in class|homework|home|remote|away|out of office|oof|offline)$/i;

export function zoneFor(room: Room): Zone {
  const cat = (room.category ?? "").toLowerCase();
  const name = room.name;

  if (ENTRY_NAMES.test(name)) return "entry";
  if (MEETING_NAMES.test(name)) return "meetings";
  if (STATUS_NAMES.test(name)) return "status";

  if (cat === "offices") return "offices";
  if (cat === "academic") return "status";
  if (cat === "common") return "entry";
  if (["papers", "projects", "engineering", "research"].includes(cat)) return "research";

  return "other";
}

export function groupByZone(rooms: Room[]): Record<Zone, Room[]> {
  const out: Record<Zone, Room[]> = {
    entry: [],
    research: [],
    offices: [],
    meetings: [],
    status: [],
    other: [],
  };
  for (const r of rooms) out[zoneFor(r)].push(r);
  return out;
}
