import { mkdir, writeFile, rename, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import type { Submission, SubmissionFile } from "@atrium/shared";
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { requirePermission } from "./permissions.js";

const PAPERS_DIR = resolve(process.env.PAPERS_DIR ?? "/data/papers");
const KEY_RE = /^[A-Za-z][A-Za-z0-9_:+-]*$/;
const GH_RE = /^https:\/\/github\.com\/\S+$/;
const MAX_FILE = 100 * 1024 * 1024;

// ---- content sniffing (the security boundary; never trust extension) ----
type Sniff = "pdf" | "zip" | "text";

function sniff(buf: Buffer, want: Sniff): boolean {
  if (want === "pdf") return buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (want === "zip") {
    // PK\x03\x04 (normal), PK\x05\x06 (empty), PK\x07\x08 (spanned). pptx/docx are zips too.
    const m = buf.subarray(0, 4);
    return m[0] === 0x50 && m[1] === 0x4b && (m[2] === 0x03 || m[2] === 0x05 || m[2] === 0x07);
  }
  // text: reject anything that looks like markup/script or contains NUL bytes
  const head = buf.subarray(0, 1024).toString("utf8").trimStart().toLowerCase();
  if (buf.includes(0x00)) return false;
  if (head.startsWith("<")) return false; // html/svg/xml
  return true;
}

function looksLikeBib(buf: Buffer): boolean {
  const s = buf.toString("utf8");
  return /@\w+\s*\{\s*[^,\s]+\s*,/.test(s);
}

// role -> { sniff kind, suffix builder from key }
interface FileSpec {
  role: string;
  want: Sniff;
  bib?: boolean;
  name: (key: string) => string;
}

const PAPER_NEW: FileSpec[] = [
  { role: "pdf", want: "pdf", name: (k) => `${k}.pdf` },
  { role: "source", want: "zip", name: (k) => `${k}-source.zip` },
  { role: "bib", want: "text", bib: true, name: (k) => `${k}.bib` },
  { role: "cite", want: "text", name: (k) => `${k}.txt` },
];

const PAPER_EDIT: FileSpec[] = [
  { role: "bib", want: "text", bib: true, name: (k) => `${k}.bib` },
  { role: "cite", want: "text", name: (k) => `${k}.txt` },
  { role: "slides-pptx", want: "zip", name: (k) => `${k}-slides.pptx` },
  { role: "slides-pdf", want: "pdf", name: (k) => `${k}-slides.pdf` },
  // Camera-ready updates (optional): replace the originally-submitted paper/source.
  { role: "pdf", want: "pdf", name: (k) => `${k}.pdf` },
  { role: "source", want: "zip", name: (k) => `${k}-source.zip` },
];

const POSTER: FileSpec[] = [
  { role: "poster", want: "pdf", name: (k) => `${k}.pdf` },
  { role: "abstract", want: "pdf", name: (k) => `${k}-abstract.pdf` }, // optional
  { role: "bib", want: "text", bib: true, name: (k) => `${k}.bib` },
  { role: "cite", want: "text", name: (k) => `${k}.txt` },
];

interface Parsed {
  fields: Record<string, string>;
  files: Record<string, { buf: Buffer; filename: string }>;
}

async function parseMultipart(req: FastifyRequest): Promise<Parsed> {
  const fields: Record<string, string> = {};
  const files: Record<string, { buf: Buffer; filename: string }> = {};
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const buf = await part.toBuffer();
      if (buf.length > MAX_FILE) throw new Error(`file ${part.fieldname} exceeds 100MB`);
      files[part.fieldname] = { buf, filename: part.filename };
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return { fields, files };
}

export function toApi(row: {
  id: string; kind: string; citationKey: string; title: string; authors: string;
  venue: string; year: number; pubType: string | null; funding: string; githubUrl: string;
  doi: string | null; abstract: string; notes: string | null; submitterName: string;
  submitterEmail: string; files: unknown; stage: string; status: string;
  deliveryLog: string | null; deliveredAt: Date | null; createdAt: Date; updatedAt: Date;
}): Submission {
  return {
    id: row.id,
    kind: row.kind as Submission["kind"],
    citationKey: row.citationKey,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    year: row.year,
    pubType: row.pubType,
    funding: row.funding,
    githubUrl: row.githubUrl,
    doi: row.doi,
    abstract: row.abstract,
    notes: row.notes,
    submitterName: row.submitterName,
    submitterEmail: row.submitterEmail,
    files: (row.files as unknown as SubmissionFile[]) ?? [],
    stage: row.stage,
    status: row.status as Submission["status"],
    deliveryLog: row.deliveryLog,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function bad(reply: FastifyReply, msg: string) {
  return reply.code(400).send({ error: msg });
}

// Validate + persist files for a spec set into /data/papers/<key>/.
// Returns the SubmissionFile[] (publicUrl null until delivered).
async function ingestFiles(
  key: string,
  specs: FileSpec[],
  files: Parsed["files"],
  optionalRoles: Set<string>,
): Promise<{ ok: true; out: SubmissionFile[] } | { ok: false; msg: string }> {
  const out: SubmissionFile[] = [];
  const dir = join(PAPERS_DIR, key);
  await mkdir(dir, { recursive: true });
  for (const spec of specs) {
    const f = files[spec.role];
    if (!f) {
      if (optionalRoles.has(spec.role)) continue;
      return { ok: false, msg: `missing required file: ${spec.role}` };
    }
    if (!sniff(f.buf, spec.want)) {
      return { ok: false, msg: `file ${spec.role} failed ${spec.want} content check (rejected)` };
    }
    if (spec.bib && !looksLikeBib(f.buf)) {
      return { ok: false, msg: `file ${spec.role} does not parse as BibTeX` };
    }
    const filename = spec.name(key);
    await writeFile(join(dir, filename), f.buf);
    out.push({ role: spec.role, filename, publicUrl: null });
  }
  return { ok: true, out };
}

export async function registerSubmissions(app: FastifyInstance, config: Config): Promise<void> {
  await mkdir(PAPERS_DIR, { recursive: true });

  // ---- funding reference (edit /config/funding.json live; read per request) ----
  app.get("/api/funding", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;
    const file = process.env.FUNDING_FILE ?? "/config/funding.json";
    try {
      return reply.send(JSON.parse(await readFile(file, "utf8")));
    } catch {
      return reply.send({ active: [], completed: [] });
    }
  });

  // ---- create: paper-new or poster ----
  app.post("/api/submissions", async (req, reply) => {
    const user = await requirePermission(req, reply, "submit", config.session.cookieName);
    if (!user) return;
    let parsed: Parsed;
    try {
      parsed = await parseMultipart(req);
    } catch (e) {
      return bad(reply, (e as Error).message);
    }
    const f = parsed.fields;
    const kind = f.kind;
    if (kind !== "paper" && kind !== "poster") return bad(reply, "kind must be paper or poster");

    const key = (f.citation_key ?? "").trim();
    if (!KEY_RE.test(key)) return bad(reply, "invalid citation_key");
    const year = Number.parseInt(f.year ?? "", 10);
    if (!Number.isInteger(year) || year < 2015 || year > 2030) return bad(reply, "year 2015-2030");
    for (const req2 of ["title", "authors", "venue", "abstract", "funding", "github_url"]) {
      if (!(f[req2] ?? "").trim()) return bad(reply, `missing ${req2}`);
    }
    if (f.github_url !== "none" && !GH_RE.test(f.github_url ?? "")) return bad(reply, "invalid github_url");
    if (f.confirmation !== "true") return bad(reply, "must confirm rights to share");

    let pubType: string | null = null;
    if (kind === "paper") {
      pubType = f.type ?? "";
      if (!["Conference", "Journal", "Workshop", "Preprint"].includes(pubType))
        return bad(reply, "invalid paper type");
    }
    let doi: string | null = null;
    if (kind === "poster") {
      doi = (f.doi ?? "").trim() || "none";
    }

    if (await prisma.submission.findFirst({ where: { citationKey: key } })) {
      return bad(reply, `a submission with key "${key}" already exists`);
    }

    const specs = kind === "paper" ? PAPER_NEW : POSTER;
    const optional = kind === "poster" ? new Set(["abstract"]) : new Set<string>();
    const res = await ingestFiles(key, specs, parsed.files, optional);
    if (!res.ok) return bad(reply, res.msg);

    const row = await prisma.submission.create({
      data: {
        kind, citationKey: key, title: (f.title ?? "").trim(), authors: (f.authors ?? "").trim(),
        venue: (f.venue ?? "").trim(), year, pubType, funding: (f.funding ?? "").trim(),
        githubUrl: (f.github_url ?? "").trim(), doi, abstract: (f.abstract ?? "").trim(),
        notes: (f.notes ?? "").trim() || null,
        submitterId: user.id, submitterName: user.name, submitterEmail: user.email,
        files: res.out as unknown as Prisma.InputJsonValue, stage: "new", status: "received",
      },
    });
    return reply.send(toApi(row));
  });

  // ---- paper post-conference edit (Package 2 merge) ----
  app.post("/api/submissions/edit", async (req, reply) => {
    const user = await requirePermission(req, reply, "submit", config.session.cookieName);
    if (!user) return;
    let parsed: Parsed;
    try {
      parsed = await parseMultipart(req);
    } catch (e) {
      return bad(reply, (e as Error).message);
    }
    const f = parsed.fields;
    const origKey = (f.original_citation_key ?? "").trim();
    const finalKey = (f.final_citation_key ?? "").trim();
    const doi = (f.doi ?? "").trim();
    if (!KEY_RE.test(origKey)) return bad(reply, "invalid original_citation_key");
    if (!KEY_RE.test(finalKey)) return bad(reply, "invalid final_citation_key");
    if (!doi) return bad(reply, "doi required");

    const existing = await prisma.submission.findFirst({ where: { citationKey: origKey, kind: "paper" } });
    if (!existing) return bad(reply, `no matching paper submission for key "${origKey}"`);

    // If key changed, rename already-delivered Package 1 files in the archive.
    const oldDir = join(PAPERS_DIR, origKey);
    const newDir = join(PAPERS_DIR, finalKey);
    let priorFiles = (existing.files as unknown as SubmissionFile[]) ?? [];
    if (finalKey !== origKey) {
      await mkdir(newDir, { recursive: true });
      const renamed: SubmissionFile[] = [];
      for (const pf of priorFiles) {
        const newName = pf.filename.replace(new RegExp(`^${origKey}`), finalKey);
        if (existsSync(join(oldDir, pf.filename))) {
          await rename(join(oldDir, pf.filename), join(newDir, newName)).catch(() => {});
        }
        renamed.push({ ...pf, filename: newName, publicUrl: null });
      }
      priorFiles = renamed;
    }

    // Package 2 files: bib + cite (with DOI) replace P1's; slides added.
    // Camera-ready paper/source are optional and replace the originals when provided.
    const res = await ingestFiles(finalKey, PAPER_EDIT, parsed.files, new Set(["pdf", "source"]));
    if (!res.ok) return bad(reply, res.msg);

    // Merge file list: any role re-uploaded in this package replaces the prior file.
    const replacedRoles = new Set(res.out.map((f) => f.role));
    const merged: SubmissionFile[] = [
      ...priorFiles.filter((p) => !replacedRoles.has(p.role)),
      ...res.out,
    ];

    const row = await prisma.submission.update({
      where: { id: existing.id },
      data: {
        citationKey: finalKey, doi, files: merged as unknown as Prisma.InputJsonValue, stage: "edited", status: "received",
        notes: (f.notes ?? "").trim() || existing.notes,
      },
    });
    return reply.send(toApi(row));
  });

  // ---- a user's own submissions ----
  app.get("/api/submissions/mine", async (req, reply) => {
    const user = await requireUser(req, reply, config.session.cookieName);
    if (!user) return;
    const rows = await prisma.submission.findMany({
      where: { submitterId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ items: rows.map(toApi) });
  });

  // ---- admin: all submissions (monitor) ----
  app.get("/api/submissions", async (req, reply) => {
    const user = await requirePermission(req, reply, "view_all_submissions", config.session.cookieName);
    if (!user) return;
    const rows = await prisma.submission.findMany({ orderBy: { createdAt: "desc" } });
    return reply.send({ items: rows.map(toApi) });
  });
}
