import type { Room } from "@atrium/shared";

export type Zone =
  | "entry"
  | "desks"
  | "projects"
  | "research"
  | "offices"
  | "meetings"
  | "status"
  | "other";

export interface ZoneDef {
  id: Zone;
  label: string;
}

// Reversible switch: when false, research-project rooms (category "Projects")
// are superseded by the per-student Desks zone and fall through to "other"
// (un-rendered on the floorplan, never deleted). Flip to true to restore the
// old Projects zone instantly.
const SHOW_PROJECTS = false;

export const ZONES: ZoneDef[] = [
  { id: "entry", label: "Entry" },
  { id: "desks", label: "Desks" },
  { id: "projects", label: "Projects" },
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

  if (cat === "desks") return "desks";
  // Broad shared rooms (Agentic, IOWarp, Jarvis, ChronoLog, Paper Reading) are
  // category "Projects" with no owner — they render on their own Projects row,
  // distinct from the per-student Desks. An owned Projects room (none seeded)
  // falls through to the research handling below.
  if (cat === "projects" && !room.ownerEmail) return "projects";
  if (cat === "offices") return "offices";
  if (cat === "academic") return "status";
  if (cat === "common") return "entry";
  // Projects are superseded by Desks unless explicitly re-enabled. When
  // SHOW_PROJECTS is false, "projects" rooms fall through to "other".
  const researchCats = SHOW_PROJECTS
    ? ["papers", "projects", "engineering", "research"]
    : ["papers", "engineering", "research"];
  if (researchCats.includes(cat)) return "research";

  return "other";
}

export function groupByZone(rooms: Room[]): Record<Zone, Room[]> {
  const out: Record<Zone, Room[]> = {
    entry: [],
    desks: [],
    projects: [],
    research: [],
    offices: [],
    meetings: [],
    status: [],
    other: [],
  };
  for (const r of rooms) out[zoneFor(r)].push(r);
  return out;
}
