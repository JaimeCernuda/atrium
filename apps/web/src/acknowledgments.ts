/**
 * Builds a copy-pasteable LaTeX "\section{Acknowledgments}" block from selected
 * funding grants and computing resources, following the center's acknowledgement
 * guide (financial support first, resource acknowledgements after, Chameleon last).
 */
import type { FundingGrant } from "@atrium/shared";
import { ACCESS_ALLOCATION, type SubmissionResource } from "./resources";

export interface DoeFacility {
  key: string;
  name: string; // "Name (Acronym)"
}

/** DOE Office of Science User Facilities the center commonly uses. */
export const DOE_FACILITIES: DoeFacility[] = [
  { key: "ALCF", name: "Argonne Leadership Computing Facility (ALCF)" },
  { key: "NERSC", name: "National Energy Research Scientific Computing Center (NERSC)" },
  { key: "OLCF", name: "Oak Ridge Leadership Computing Facility (OLCF)" },
  { key: "ESnet", name: "Energy Sciences Network (ESnet)" },
];

const ORG_NAME: Record<NonNullable<FundingGrant["org"]>, string> = {
  NSF: "National Science Foundation (NSF)",
  DOE: "U.S. Department of Energy (DOE)",
};

/** Escape the LaTeX-special characters that appear in acknowledgement text. */
function tex(s: string): string {
  return s.replace(/([&#%_$])/g, "\\$1");
}

/** "a" / "a and b" / "a, b, and c" — for short items (award numbers, systems). */
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Join the long, internally-"and"-containing organization clauses. Always uses
 * the comma before the connecting "and" (even for two) so it reads correctly:
 * "…under Grant Nos. X and Y, and the U.S. Department of Energy…".
 */
function joinClauses(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function instrumentLabel(kind: NonNullable<FundingGrant["instrument"]>, n: number): string {
  if (kind === "award") return n > 1 ? "Award Numbers" : "Award Number";
  if (kind === "contract") return n > 1 ? "Contracts" : "Contract";
  return n > 1 ? "Grant Nos." : "Grant No."; // default: grant
}

// Fall back to parsing the raw grant string when structured fields are absent.
function derive(g: FundingGrant): { org: "NSF" | "DOE"; office: string; instrument: NonNullable<FundingGrant["instrument"]>; awardId: string } {
  const org = g.org ?? (g.grant.startsWith("DOE") ? "DOE" : "NSF");
  const office = g.office ?? (org === "DOE" ? "Office of Science" : "");
  const instrument = g.instrument ?? (org === "DOE" ? "award" : "grant");
  const awardId = g.awardId ?? g.grant.split(/[\s-]/).pop() ?? g.grant;
  return { org, office, instrument, awardId };
}

export interface AckInput {
  grants: FundingGrant[];
  resources: SubmissionResource[]; // Chameleon / Delta / DeltaAI
  doeFacilities: string[]; // DoeFacility.key[]
  partial: boolean; // "in part" — Dr. Sun recommends always true
}

export function buildAcknowledgments(input: AckInput): string {
  const { grants, resources, doeFacilities, partial } = input;
  const sentences: string[] = [];
  const inPart = partial ? "in part " : "";

  // --- Financial support: group by (org, office), preserving first-seen order. ---
  if (grants.length > 0) {
    const groups: Array<{ org: "NSF" | "DOE"; office: string; instrument: NonNullable<FundingGrant["instrument"]>; ids: string[] }> = [];
    for (const g of grants) {
      const d = derive(g);
      const existing = groups.find((x) => x.org === d.org && x.office === d.office);
      if (existing) existing.ids.push(d.awardId);
      else groups.push({ org: d.org, office: d.office, instrument: d.instrument, ids: [d.awardId] });
    }
    const clauses = groups.map((grp) => {
      const office = grp.office ? `, ${grp.office}` : "";
      const instr = instrumentLabel(grp.instrument, grp.ids.length);
      return `the ${ORG_NAME[grp.org]}${office}, under ${instr} ${joinAnd(grp.ids)}`;
    });
    sentences.push(`This material is based upon work supported ${inPart}by ${joinClauses(clauses)}.`);
  }

  // --- Resource acknowledgements, unified by funding agency. ---
  // NSF resources (ACCESS-provided NCSA systems + the Chameleon testbed) collapse
  // into a single sentence; each program's required wording is preserved.
  const ncsa = resources.filter((r) => r === "Delta" || r === "DeltaAI");
  const hasChameleon = resources.includes("Chameleon");
  const accessClause = ncsa.length
    ? `the ${joinAnd(ncsa)} system${ncsa.length > 1 ? "s" : ""} at the National Center for Supercomputing Applications through allocation ${ACCESS_ALLOCATION} from the Advanced Cyberinfrastructure Coordination Ecosystem: Services & Support (ACCESS) program, which is supported by U.S. National Science Foundation grants #2138259, #2138286, #2138307, #2137603, and #2138296`
    : "";

  if (accessClause && hasChameleon) {
    sentences.push(
      tex(
        `This work used ${inPart}${accessClause}, as well as the Chameleon testbed, also supported by the National Science Foundation (NSF).`,
      ),
    );
  } else if (accessClause) {
    sentences.push(tex(`This work used ${inPart}${accessClause}.`));
  } else if (hasChameleon) {
    sentences.push(
      tex(
        `Results presented in this paper were obtained ${inPart}using the Chameleon testbed supported by the National Science Foundation (NSF).`,
      ),
    );
  }

  // DOE Office of Science User Facilities collapse into a single sentence.
  const facilities = DOE_FACILITIES.filter((f) => doeFacilities.includes(f.key)).map((f) => f.name);
  if (facilities.length > 0) {
    const verb = facilities.length > 1 ? "are DOE Office of Science User Facilities" : "is a DOE Office of Science User Facility";
    sentences.push(`This research used ${inPart}resources of the ${joinAnd(facilities)}, which ${verb}.`);
  }

  return `\\section{Acknowledgments}\n${sentences.join(" ")}`;
}
