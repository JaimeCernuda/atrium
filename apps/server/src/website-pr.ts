/**
 * Auto-publish GRC submissions to the public website (grc-iit/website) by
 * opening (and keeping in sync) a per-submission PR that adds/updates a
 * data/publications/<slug>.yaml entry. A human admin reviews and merges it.
 *
 * Auth is a GitHub App (installation token), spoken to over plain fetch — no
 * Octokit dependency, mirroring the Zulip client's fetch-with-secret pattern.
 *
 * Configuration is split like the rest of the app:
 *   - Secrets in env: WEBSITE_APP_ID, WEBSITE_APP_PRIVATE_KEY, WEBSITE_APP_INSTALLATION_ID
 *   - Non-secret, live-editable: config/website.json (repo, baseBranch, ...)
 * If either is missing the whole integration is inert (every entry point is a
 * no-op) so the rest of the app — pre-release mode, the update flow, cancel —
 * works without a GitHub App configured.
 *
 * NOTE: type-only import from @atrium/shared (it ships as raw TS and cannot be
 * required at runtime by the compiled server).
 */
import { readFile } from "node:fs/promises";
import { createSign, createHash, randomBytes } from "node:crypto";
import type { FundingList, Submission } from "@atrium/shared";
import { prisma } from "./db.js";

const API = "https://api.github.com";

interface WebsiteConfig {
  repo: string; // "grc-iit/website"
  baseBranch: string; // "main"
  publicationsDir: string; // "data/publications"
  authorAliases: Record<string, string>; // "Xian-He Sun" -> "X.-H. Sun"
  typeMap: Record<string, string>; // paper pubType -> website type
  enabled: boolean;
}

interface AppCreds {
  appId: string;
  privateKey: string;
  installationId: string;
}

// ───────────────────────── configuration ─────────────────────────

function appCreds(): AppCreds | null {
  const appId = process.env.WEBSITE_APP_ID;
  const rawKey = process.env.WEBSITE_APP_PRIVATE_KEY;
  const installationId = process.env.WEBSITE_APP_INSTALLATION_ID;
  if (!appId || !rawKey || !installationId) return null;
  // Accept a PEM with escaped newlines, or a base64-encoded PEM (env-friendly).
  const privateKey = rawKey.includes("BEGIN")
    ? rawKey.replace(/\\n/g, "\n")
    : Buffer.from(rawKey, "base64").toString("utf8");
  return { appId, privateKey, installationId };
}

/**
 * Simpler alternative to the GitHub App: a personal access token (repo scope).
 * PRs are authored by the token's owner. Takes precedence over the App creds
 * when set. Set WEBSITE_GITHUB_TOKEN in .env (e.g. from `gh auth token`).
 */
function personalToken(): string | null {
  return process.env.WEBSITE_GITHUB_TOKEN || null;
}

export function websiteIntegrationConfigured(): boolean {
  return personalToken() !== null || appCreds() !== null;
}

async function loadWebsiteConfig(): Promise<WebsiteConfig | null> {
  const file = process.env.WEBSITE_CONFIG_FILE ?? "/config/website.json";
  let raw: Partial<WebsiteConfig>;
  try {
    raw = JSON.parse(await readFile(file, "utf8")) as Partial<WebsiteConfig>;
  } catch {
    return null;
  }
  if (raw.enabled === false) return null;
  if (!raw.repo) return null;
  return {
    repo: raw.repo,
    baseBranch: raw.baseBranch ?? "main",
    publicationsDir: raw.publicationsDir ?? "data/publications",
    authorAliases: raw.authorAliases ?? {},
    typeMap: raw.typeMap ?? {},
    enabled: raw.enabled ?? true,
  };
}

// ───────────────────────── GitHub App auth ─────────────────────────

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function appJwt(creds: AppCreds): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: creds.appId }));
  const data = `${header}.${payload}`;
  const sig = createSign("RSA-SHA256").update(data).sign(creds.privateKey);
  return `${data}.${b64url(sig)}`;
}

let tokenCache: { token: string; expMs: number } | null = null;

async function installationToken(): Promise<string | null> {
  // A personal access token (WEBSITE_GITHUB_TOKEN) is used directly if present —
  // no JWT/installation dance. PRs are then authored by the token's owner.
  const pat = personalToken();
  if (pat) return pat;
  const creds = appCreds();
  if (!creds) return null;
  if (tokenCache && tokenCache.expMs - 60_000 > Date.now()) return tokenCache.token;
  const res = await fetch(`${API}/app/installations/${creds.installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appJwt(creds)}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    console.warn(`[website-pr] token exchange failed: ${res.status} ${await safeText(res)}`);
    return null;
  }
  const j = (await res.json()) as { token: string; expires_at: string };
  tokenCache = { token: j.token, expMs: new Date(j.expires_at).getTime() };
  return j.token;
}

async function safeText(res: Response): Promise<string> {
  return res.text().catch(() => "");
}

async function gh(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ───────────────────────── YAML generation ─────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// role on the submission -> key in the publication `links` map.
const LINK_KEY: Record<string, string> = {
  pdf: "pdf",
  bib: "bibtex",
  cite: "citation",
  poster: "poster",
  "slides-pdf": "slides",
};

type SubRow = Awaited<ReturnType<typeof prisma.submission.findUnique>>;

function asApi(row: NonNullable<SubRow>): Submission {
  // Only the fields the YAML builder needs; typed against the shared shape.
  return {
    ...(row as unknown as Submission),
    files: (row.files as unknown as Submission["files"]) ?? [],
    resources: (row.resources as unknown as Submission["resources"]) ?? [],
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function lastNameSlug(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean);
  return slugify(parts[parts.length - 1] ?? "") || "anon";
}

function makeSlug(sub: Submission): string {
  const authors = splitAuthors(sub.authors);
  const first = authors[0] ? lastNameSlug(authors[0]) : "anon";
  const titleSlug = slugify(sub.title).split("-").slice(0, 6).join("-");
  const hash = randomBytes(2).toString("hex");
  return `${first}-${sub.year}-${titleSlug}-${hash}`.replace(/-+/g, "-");
}

function splitAuthors(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "Xian-He Sun" -> "X.-H. Sun", "Meng Tang" -> "M. Tang". Alias map wins. */
function shortAuthor(name: string, aliases: Record<string, string>): string {
  const trimmed = name.trim();
  if (aliases[trimmed]) return aliases[trimmed];
  const noTitle = trimmed.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s+/i, "");
  const parts = noTitle.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return noTitle;
  const last = parts[parts.length - 1] ?? "";
  const initials = (parts[0] ?? "")
    .split("-")
    .map((seg) => (seg[0] ? `${seg[0].toUpperCase()}.` : ""))
    .filter(Boolean)
    .join("-");
  return `${initials} ${last}`;
}

function websiteType(sub: Submission, typeMap: Record<string, string>): string {
  if (sub.kind === "poster") return "Poster";
  const t = sub.pubType ?? "";
  const mapped = typeMap[t];
  if (mapped) return mapped;
  if (["Conference", "Journal", "Workshop"].includes(t)) return t;
  return "WIP"; // Preprint / unknown -> work-in-progress
}

async function fundingTags(sub: Submission): Promise<string[]> {
  const file = process.env.FUNDING_FILE ?? "/config/funding.json";
  let list: FundingList;
  try {
    list = JSON.parse(await readFile(file, "utf8")) as FundingList;
  } catch {
    return [];
  }
  const grants = [...(list.active ?? []), ...(list.completed ?? [])];
  const chosen = splitAuthors(sub.funding); // reuse comma-splitter
  const tags = new Set<string>();
  for (const g of grants) {
    if (chosen.some((c) => c === g.grant || c === g.project)) tags.add(g.project);
  }
  return [...tags];
}

function linksMap(sub: Submission): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of sub.files) {
    if (!f.publicUrl) continue;
    const key = LINK_KEY[f.role];
    if (key && !out[key]) out[key] = f.publicUrl;
  }
  return out;
}

function yamlStr(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Build the publication YAML + resolve the (stable) slug for this submission. */
export async function buildPublicationYaml(
  sub: Submission,
  cfg: WebsiteConfig,
): Promise<{ yaml: string; slug: string }> {
  const slug = sub.websiteSlug ?? makeSlug(sub);
  const authors = splitAuthors(sub.authors).map((a) => shortAuthor(a, cfg.authorAliases));
  const type = websiteType(sub, cfg.typeMap);
  const when = sub.deliveredAt ? new Date(sub.deliveredAt) : new Date(sub.createdAt);
  const month = when.getMonth() + 1;
  const date = `${MONTHS[month - 1]}, ${sub.year}`;
  const tags = await fundingTags(sub);
  const links = linksMap(sub);

  const lines: string[] = [];
  lines.push("# Auto-generated by Atrium from a GRC submission. Reviewer may edit before merge.");
  lines.push(`title: ${yamlStr(sub.title)}`);
  lines.push("authors:");
  for (const a of authors) lines.push(`  - ${yamlStr(a)}`);
  if (authors.length === 0) lines[lines.length - 1] = "authors: []";
  lines.push(`venue: ${yamlStr(sub.venue)}`);
  lines.push(`type: ${type}`);
  lines.push(`date: ${yamlStr(date)}`);
  lines.push(`month: ${month}`);
  lines.push(`year: ${sub.year}`);
  if (tags.length) {
    lines.push("tags:");
    for (const t of tags) lines.push(`  - ${yamlStr(t)}`);
  } else {
    lines.push("tags: []");
  }
  const linkEntries = Object.entries(links);
  if (linkEntries.length) {
    lines.push("links:");
    for (const [k, v] of linkEntries) lines.push(`  ${k}: ${yamlStr(v)}`);
  } else {
    // Pre-release / not-yet-delivered: no download links yet (valid state).
    lines.push("links: {}");
  }
  lines.push(`slug: ${slug}`);
  if (sub.doi && sub.doi !== "none") lines.push(`doi: ${yamlStr(sub.doi)}`);
  if (sub.abstract && sub.abstract.trim()) {
    lines.push("abstract: |-");
    for (const ln of sub.abstract.replace(/\r\n/g, "\n").split("\n")) {
      lines.push(`  ${ln}`);
    }
  }
  return { yaml: lines.join("\n") + "\n", slug };
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// ───────────────────────── GitHub repo helpers ─────────────────────────

function encPath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

async function getRefSha(token: string, cfg: WebsiteConfig, branch: string): Promise<string | null> {
  const res = await gh(token, "GET", `/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!res.ok) return null;
  const j = (await res.json()) as { object?: { sha?: string } };
  return j.object?.sha ?? null;
}

async function ensureBranch(token: string, cfg: WebsiteConfig, branch: string): Promise<void> {
  if (await getRefSha(token, cfg, branch)) return;
  const baseSha = await getRefSha(token, cfg, cfg.baseBranch);
  if (!baseSha) throw new Error(`base branch ${cfg.baseBranch} not found`);
  const res = await gh(token, "POST", `/repos/${cfg.repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });
  if (!res.ok && res.status !== 422) {
    throw new Error(`create branch ${branch}: ${res.status} ${await safeText(res)}`);
  }
}

interface GhPr {
  number: number;
  html_url: string;
  state: string;
  merged?: boolean;
  head: { ref: string };
}

async function getPr(token: string, cfg: WebsiteConfig, num: number): Promise<GhPr | null> {
  const res = await gh(token, "GET", `/repos/${cfg.repo}/pulls/${num}`);
  if (!res.ok) return null;
  return (await res.json()) as GhPr;
}

async function findOpenPr(token: string, cfg: WebsiteConfig, branch: string): Promise<GhPr | null> {
  const owner = cfg.repo.split("/")[0];
  const res = await gh(
    token,
    "GET",
    `/repos/${cfg.repo}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`,
  );
  if (!res.ok) return null;
  const arr = (await res.json()) as GhPr[];
  return (Array.isArray(arr) ? arr[0] : null) ?? null;
}

async function putFile(
  token: string,
  cfg: WebsiteConfig,
  branch: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  let sha: string | undefined;
  const get = await gh(token, "GET", `/repos/${cfg.repo}/contents/${encPath(path)}?ref=${encodeURIComponent(branch)}`);
  if (get.ok) sha = ((await get.json()) as { sha?: string }).sha;
  const res = await gh(token, "PUT", `/repos/${cfg.repo}/contents/${encPath(path)}`, {
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
    ...(sha ? { sha } : {}),
  });
  if (!res.ok) throw new Error(`put ${path}: ${res.status} ${await safeText(res)}`);
}

function prBody(sub: Submission): string {
  return [
    `Auto-generated by Atrium from the submission **${sub.citationKey}** by ${sub.submitterName}.`,
    "",
    "- Download links resolve once the camera-ready files are delivered.",
    "- **Submitter:** please review this entry for accuracy, then ask an admin to merge it.",
    "- Fields like author short-names, tags, and type may need a quick edit here before merge.",
  ].join("\n");
}

async function createPr(token: string, cfg: WebsiteConfig, branch: string, sub: Submission): Promise<GhPr> {
  const res = await gh(token, "POST", `/repos/${cfg.repo}/pulls`, {
    title: `Publish: ${sub.title}`,
    head: branch,
    base: cfg.baseBranch,
    body: prBody(sub),
    maintainer_can_modify: true,
  });
  if (res.ok) return (await res.json()) as GhPr;
  const open = await findOpenPr(token, cfg, branch);
  if (open) return open;
  throw new Error(`create PR: ${res.status} ${await safeText(res)}`);
}

// ───────────────────────── public entry points ─────────────────────────

/**
 * Open or update the publication PR for one submission. Idempotent: if the
 * generated YAML matches what was last pushed, it's a no-op. Never throws —
 * failures are logged so a submission is never blocked on GitHub being reachable.
 */
export async function syncSubmissionToWebsite(id: string): Promise<void> {
  try {
    if (!websiteIntegrationConfigured()) return;
    const cfg = await loadWebsiteConfig();
    if (!cfg) return;
    const token = await installationToken();
    if (!token) return;

    const row = await prisma.submission.findUnique({ where: { id } });
    if (!row) return;
    // A withdrawn submission must not be re-published by a later sync.
    if (row.status === "cancelling" || row.status === "cancelled") return;

    const sub = asApi(row);
    // Assign + persist a stable slug on first sync so updates target one file.
    let slug = sub.websiteSlug;
    if (!slug) {
      slug = makeSlug(sub);
      await prisma.submission.update({ where: { id }, data: { websiteSlug: slug } });
      sub.websiteSlug = slug;
    }

    const { yaml } = await buildPublicationYaml(sub, cfg);
    const hash = sha256(yaml);
    if (row.websiteContentHash === hash && sub.websitePrUrl) return; // already up to date

    // Pick the branch: reuse the open PR's branch; after a merge/close, a fresh
    // content-hashed branch off base carries the next change.
    let branch = `atrium/pub-${slug}`;
    let existingPr: GhPr | null = null;
    if (sub.websitePrNumber) {
      const pr = await getPr(token, cfg, sub.websitePrNumber);
      if (pr && pr.state === "open") {
        branch = pr.head.ref;
        existingPr = pr;
      } else {
        branch = `atrium/pub-${slug}-${hash.slice(0, 8)}`;
      }
    }

    await ensureBranch(token, cfg, branch);
    await putFile(token, cfg, branch, `${cfg.publicationsDir}/${slug}.yaml`, yaml, `Publish: ${sub.title}`);
    const pr = existingPr ?? (await createPr(token, cfg, branch, sub));

    await prisma.submission.update({
      where: { id },
      data: {
        websiteContentHash: hash,
        websitePrUrl: pr.html_url,
        websitePrNumber: pr.number,
        websiteSyncedAt: new Date(),
      },
    });
    console.log(`[website-pr] synced ${sub.citationKey} -> ${pr.html_url}`);
  } catch (e) {
    console.warn(`[website-pr] sync failed for ${id}: ${(e as Error).message}`);
  }
}

/**
 * Withdraw a submission from the website. If the publication PR is still open,
 * close it and delete the branch. If it was already merged (entry is live), open
 * an "Unpublish" PR that deletes the file for an admin to merge. Never throws.
 */
export async function revertSubmissionOnWebsite(id: string): Promise<void> {
  try {
    if (!websiteIntegrationConfigured()) return;
    const cfg = await loadWebsiteConfig();
    if (!cfg) return;
    const token = await installationToken();
    if (!token) return;

    const row = await prisma.submission.findUnique({ where: { id } });
    if (!row || !row.websiteSlug || !row.websitePrNumber) return;
    const pr = await getPr(token, cfg, row.websitePrNumber);
    if (!pr) return;
    const path = `${cfg.publicationsDir}/${row.websiteSlug}.yaml`;

    if (pr.state === "open") {
      await gh(token, "PATCH", `/repos/${cfg.repo}/pulls/${pr.number}`, { state: "closed" });
      await gh(token, "DELETE", `/repos/${cfg.repo}/git/refs/heads/${encodeURIComponent(pr.head.ref)}`);
      console.log(`[website-pr] closed PR #${pr.number} for withdrawn ${row.citationKey}`);
      return;
    }

    if (pr.merged) {
      const branch = `atrium/unpub-${row.websiteSlug}`;
      await ensureBranch(token, cfg, branch);
      const get = await gh(token, "GET", `/repos/${cfg.repo}/contents/${encPath(path)}?ref=${encodeURIComponent(branch)}`);
      if (get.ok) {
        const sha = ((await get.json()) as { sha?: string }).sha;
        if (sha) {
          await gh(token, "DELETE", `/repos/${cfg.repo}/contents/${encPath(path)}`, {
            message: `Unpublish: ${row.title}`,
            branch,
            sha,
          });
        }
      }
      const res = await gh(token, "POST", `/repos/${cfg.repo}/pulls`, {
        title: `Unpublish: ${row.title}`,
        head: branch,
        base: cfg.baseBranch,
        body: `Withdrawn in Atrium — removes the publication entry for **${row.citationKey}**.`,
        maintainer_can_modify: true,
      });
      if (res.ok) {
        const prj = (await res.json()) as GhPr;
        await prisma.submission.update({ where: { id }, data: { unpublishPrUrl: prj.html_url } });
        console.log(`[website-pr] opened unpublish PR ${prj.html_url} for ${row.citationKey}`);
      }
    }
  } catch (e) {
    console.warn(`[website-pr] revert failed for ${id}: ${(e as Error).message}`);
  }
}

/**
 * Backstop reconcile: delivery is done out-of-band by the host cron script, so
 * the server isn't notified when files land. Every few minutes, re-sync any
 * already-adopted submission whose current YAML differs from what was last
 * pushed (e.g. links now resolve). Never adopts pre-existing rows that were
 * never synced at create time — no PR floods on first deploy.
 */
export function startWebsiteReconcileLoop(): void {
  if (!websiteIntegrationConfigured()) return;
  const tick = async () => {
    try {
      const cfg = await loadWebsiteConfig();
      if (!cfg) return;
      const rows = await prisma.submission.findMany({
        where: { websiteSlug: { not: null }, status: { notIn: ["cancelling", "cancelled"] } },
        orderBy: { updatedAt: "desc" },
        take: 200,
      });
      for (const row of rows) {
        const { yaml } = await buildPublicationYaml(asApi(row), cfg);
        if (sha256(yaml) !== row.websiteContentHash) await syncSubmissionToWebsite(row.id);
      }
    } catch (e) {
      console.warn(`[website-pr] reconcile tick failed: ${(e as Error).message}`);
    }
  };
  const timer = setInterval(() => void tick(), 4 * 60 * 1000);
  timer.unref?.();
  console.log("[website-pr] reconcile loop started");
}
