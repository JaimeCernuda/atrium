import { mkdir, writeFile, rename, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import type { Submission, SubmissionFile, SubmissionResource } from "@atrium/shared";

// Runtime list of valid resource tags. Defined locally (not imported as a value
// from @atrium/shared, which ships as TS source and cannot be required at runtime)
// but typed against the shared union so it fails to compile if the two drift.
const SUBMISSION_RESOURCES: readonly SubmissionResource[] = ["Chameleon", "Delta", "DeltaAI"];
import { prisma } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { requirePermission } from "./permissions.js";
import { syncSubmissionToWebsite, revertSubmissionOnWebsite } from "./website-pr.js";

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

const RESOURCE_SET = new Set<string>(SUBMISSION_RESOURCES);

// Parse the comma-separated `resources` form field into a validated, de-duped,
// canonically-ordered list. Returns null if any tag is not a known resource.
function parseResources(raw: string | undefined): SubmissionResource[] | null {
  const picked = new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const r of picked) if (!RESOURCE_SET.has(r)) return null;
  return SUBMISSION_RESOURCES.filter((r) => picked.has(r));
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
  venue: string; year: number; pubType: string | null; funding: string; resources: string[];
  githubUrl: string;
  doi: string | null; abstract: string; notes: string | null; submitterName: string;
  submitterEmail: string; files: unknown; stage: string; status: string;
  deliveryLog: string | null; deliveredAt: Date | null;
  websiteSlug: string | null; websitePrUrl: string | null; websitePrNumber: number | null;
  unpublishPrUrl: string | null;
  createdAt: Date; updatedAt: Date;
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
    resources: (row.resources as SubmissionResource[]) ?? [],
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
    websiteSlug: row.websiteSlug,
    websitePrUrl: row.websitePrUrl,
    websitePrNumber: row.websitePrNumber,
    unpublishPrUrl: row.unpublishPrUrl,
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

    const resources = parseResources(f.resources);
    if (resources === null) return bad(reply, "invalid resource tag");

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

    // Pre-release notification: the paper isn't published yet, so no files exist.
    // Every file role becomes optional and the record starts in the "announced"
    // stage. The member later attaches the camera-ready files via /edit.
    const prerelease = f.mode === "prerelease";
    const specs = kind === "paper" ? PAPER_NEW : POSTER;
    const optional = prerelease
      ? new Set(specs.map((s) => s.role))
      : kind === "poster"
        ? new Set(["abstract"])
        : new Set<string>();
    const res = await ingestFiles(key, specs, parsed.files, optional);
    if (!res.ok) return bad(reply, res.msg);

    const row = await prisma.submission.create({
      data: {
        kind, citationKey: key, title: (f.title ?? "").trim(), authors: (f.authors ?? "").trim(),
        venue: (f.venue ?? "").trim(), year, pubType, funding: (f.funding ?? "").trim(), resources,
        githubUrl: (f.github_url ?? "").trim(), doi, abstract: (f.abstract ?? "").trim(),
        notes: (f.notes ?? "").trim() || null,
        submitterId: user.id, submitterName: user.name, submitterEmail: user.email,
        files: res.out as unknown as Prisma.InputJsonValue,
        stage: prerelease ? "announced" : "new",
        status: "received",
      },
    });
    void syncSubmissionToWebsite(row.id); // fire-and-forget; inert if unconfigured
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
    const resources = parseResources(f.resources);
    if (resources === null) return bad(reply, "invalid resource tag");

    const existing = await prisma.submission.findFirst({ where: { citationKey: origKey } });
    if (!existing) return bad(reply, `no matching submission for key "${origKey}"`);

    // Two update shapes, distinguished by the record's current stage:
    //  - "announced" (pre-release) -> now attaching the published files for the
    //    first time. File slots are the kind's normal set, all optional (attach
    //    what you have), DOI optional. Paper advances announced -> new.
    //  - "new"/"edited" paper -> the post-conference package (updated citations
    //    with DOI + slides). DOI required, as before.
    const initial = existing.stage === "announced";
    if (!initial && !doi) return bad(reply, "doi required");
    const specs = initial ? (existing.kind === "paper" ? PAPER_NEW : POSTER) : PAPER_EDIT;
    const optionalRoles = initial
      ? new Set(specs.map((s) => s.role))
      : new Set(["pdf", "source"]);

    // If key changed, rename already-delivered files in the archive.
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

    const res = await ingestFiles(finalKey, specs, parsed.files, optionalRoles);
    if (!res.ok) return bad(reply, res.msg);

    // Merge file list: any role re-uploaded in this package replaces the prior file.
    const replacedRoles = new Set(res.out.map((f) => f.role));
    const merged: SubmissionFile[] = [
      ...priorFiles.filter((p) => !replacedRoles.has(p.role)),
      ...res.out,
    ];

    const nextStage = initial ? (existing.kind === "paper" ? "new" : existing.stage) : "edited";
    const row = await prisma.submission.update({
      where: { id: existing.id },
      data: {
        citationKey: finalKey,
        doi: doi || existing.doi,
        resources,
        files: merged as unknown as Prisma.InputJsonValue,
        stage: nextStage,
        status: "received",
        notes: (f.notes ?? "").trim() || existing.notes,
      },
    });
    void syncSubmissionToWebsite(row.id); // reflect the new files/DOI on the site
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

  // ---- admin: cancel / delete a submission ----
  // Removes the footprint everywhere: local archive (now), the website PR/entry
  // (now, via the GitHub App), and the babbage-hosted files. The server cannot
  // reach babbage (delivery is host-side), so remote removal is delegated to the
  // deliver cron: rows are parked in status "cancelling" and the script rm's the
  // remote files, then either flips to "cancelled" (cancel) or deletes the row
  // (delete, purgeRequested=true). Submissions that never delivered anything have
  // no remote files, so they finish immediately here.
  app.delete<{ Params: { id: string }; Querystring: { mode?: string } }>(
    "/api/submissions/:id",
    async (req, reply) => {
      const user = await requirePermission(req, reply, "manage_submissions", config.session.cookieName);
      if (!user) return;
      const existing = await prisma.submission.findUnique({ where: { id: req.params.id } });
      if (!existing) return reply.code(404).send({ error: "not_found" });
      const purge = req.query.mode === "delete";

      // Withdraw from the website (close open PR, or open an unpublish PR).
      await revertSubmissionOnWebsite(existing.id);

      // Delete the local archive directory immediately.
      await rm(join(PAPERS_DIR, existing.citationKey), { recursive: true, force: true }).catch(() => {});

      const files = (existing.files as unknown as SubmissionFile[]) ?? [];
      const hasRemote = files.some((f) => f.publicUrl);

      if (!hasRemote) {
        // Nothing on babbage to clean up — finish now.
        if (purge) {
          await prisma.submission.delete({ where: { id: existing.id } });
          return reply.send({ ok: true, purged: true });
        }
        const row = await prisma.submission.update({
          where: { id: existing.id },
          data: { status: "cancelled" },
        });
        return reply.send({ ok: true, submission: toApi(row) });
      }

      // Remote files exist: hand off to the deliver script's cancellation pass.
      const row = await prisma.submission.update({
        where: { id: existing.id },
        data: { status: "cancelling", purgeRequested: purge },
      });
      return reply.send({ ok: true, submission: toApi(row), pendingRemoteCleanup: true });
    },
  );
}
