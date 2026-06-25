import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Avatar,
  Box,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  Paper,
  Popper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import GroupIcon from "@mui/icons-material/Group";
import TagIcon from "@mui/icons-material/Tag";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import CodeIcon from "@mui/icons-material/Code";
import DataObjectIcon from "@mui/icons-material/DataObject";
import ReplyIcon from "@mui/icons-material/Reply";
import DOMPurify from "dompurify";
import { useNavigate } from "react-router-dom";
import { getSocket } from "../../socket";
import type { ChatMessage, ZulipChannel, ZulipUser, ZulipUserGroup } from "@atrium/shared";
import { useStore } from "../../store";

// Zulip already sanitizes server-side; DOMPurify is defense-in-depth before we
// hand raw HTML to dangerouslySetInnerHTML. Strict allowlist — no script/style,
// no event handlers, no forms.
// Force every link (not just the upload-rewritten ones) to open in a new tab
// with a safe rel, closing reverse-tabnabbing on all message links. Registered
// once at module load — never inside render.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  }
});

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "del",
    "a", "img", "pre", "code", "blockquote",
    "ul", "ol", "li", "hr", "span", "div",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "rel", "target", "data-user-id"],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
};

// Zulip /user_uploads/* (relative or absolute grc.zulipchat.com) need auth, so
// point <img src>/<a href> at our authed proxy instead of fetching directly.
function rewriteUploadUrls(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("img[src], a[href]").forEach((el) => {
    const attr = el.tagName === "A" ? "href" : "src";
    const raw = el.getAttribute(attr);
    if (!raw) return;
    const m = raw.match(/^(?:https:\/\/grc\.zulipchat\.com)?(\/user_uploads\/.+)$/);
    if (m) {
      el.setAttribute(attr, `/api/zulip/upload?path=${encodeURIComponent(m[1]!)}`);
      if (el.tagName === "A") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noreferrer");
      }
    }
  });
  return doc.body.innerHTML;
}

// Zulip message bodies arrive as rendered HTML (apply_markdown). Plain-text
// bodies (internal DMs, unmapped global) have no markup — fast-path them so
// they keep rendering through the plain <Typography> branch.
function renderBody(body: string): { html: string } | null {
  if (body.indexOf("<") === -1) return null;
  return { html: rewriteUploadUrls(DOMPurify.sanitize(body, SANITIZE_CONFIG)) };
}

// ───── Quote-and-reply helpers ─────
// The Zulip realm narrow base. Narrow URLs deep-link the quoted message.
const QUOTE_REALM = "https://grc.zulipchat.com";

/** Plain-text of a (possibly HTML) message body, whitespace-collapsed. */
export function plainTextFromHtml(html: string): string {
  if (html.indexOf("<") === -1) return html.replace(/\s+/g, " ").trim();
  if (typeof document === "undefined") return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/[ \t]+/g, " ").trim();
}

// Zulip's canonical hash-component encoder (web/src/internal_url.ts
// `encodeHashComponent`). location.hash is URI-decoded by the browser, so Zulip
// hides its escaping behind '.' instead of '%'. A plain encodeURIComponent would
// leave a literal '.' in topics like "v1.2"/"node.js", which Zulip's decoder
// mis-reads as the start of a percent-escape — corrupting the deep-link target.
function encodeHashComponent(str: string): string {
  return encodeURIComponent(str).replace(
    /[%!'()*.]/g,
    (c) =>
      ({
        "%": ".",
        "!": ".21",
        "'": ".27",
        "(": ".28",
        ")": ".29",
        "*": ".2A",
        ".": ".2E",
      })[c]!,
  );
}

/** Channel+topic narrow URL (Zulip's `#narrow/stream/<id>/topic/<topic>`). */
export function channelNarrowUrl(channelId: number, topicName: string): string {
  return `${QUOTE_REALM}/#narrow/stream/${channelId}/topic/${encodeHashComponent(topicName)}`;
}

/** DM narrow URL for the OTHER participant ids (`#narrow/dm/<id1,id2,…>`). */
export function dmNarrowUrl(otherIds: number[]): string {
  return `${QUOTE_REALM}/#narrow/dm/${otherIds.join(",")}`;
}

// Inverse of encodeHashComponent: Zulip hides percent-escapes behind '.', so a
// hash segment like "v1.2E0" decodes to "v1.0" only after we turn '.' back into
// '%' and URI-decode. Falls back to the raw segment if decoding throws.
function decodeHashComponent(str: string): string {
  try {
    return decodeURIComponent(str.replace(/\./g, "%"));
  } catch {
    return str;
  }
}

// A parsed Zulip narrow that we can open inside Atrium instead of in Zulip web.
export type ZulipNarrowTarget =
  | { kind: "stream"; channelId: number; topic: string | null; nearId: number | null }
  | { kind: "dm"; otherIds: number[]; nearId: number | null };

/**
 * Parse a grc.zulipchat.com narrow URL (`/#narrow/stream/<id>/topic/<t>[/near/<id>]`
 * or `/#narrow/dm/<id1,id2,…>[/near/<id>]`) into a jump target. Returns null for
 * any link that isn't a Zulip narrow we know how to open inside Atrium, so all
 * other links keep their normal new-tab behaviour. Tolerates the legacy `pm-with`
 * and `stream`-id-with-name (`12-general`) forms Zulip still emits.
 */
export function parseZulipNarrow(href: string): ZulipNarrowTarget | null {
  let url: URL;
  try {
    url = new URL(href, QUOTE_REALM);
  } catch {
    return null;
  }
  if (url.hostname !== "grc.zulipchat.com") return null;
  const hash = url.hash; // e.g. "#narrow/stream/12-general/topic/hi/near/345"
  if (!hash.startsWith("#narrow/")) return null;
  const parts = hash.slice("#narrow/".length).split("/");

  // Pull operator/operand pairs into a small map, keeping the first of each.
  const ops: Record<string, string> = {};
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const op = parts[i]!;
    if (!(op in ops)) ops[op] = parts[i + 1]!;
  }
  const nearRaw = ops["near"];
  const nearId = nearRaw != null && /^\d+$/.test(nearRaw) ? Number(nearRaw) : null;

  const streamRaw = ops["stream"] ?? ops["channel"];
  if (streamRaw != null) {
    // Stream operand is "<id>" or "<id>-<slug>"; the leading integer is the id.
    const channelId = Number(streamRaw.split("-")[0]);
    if (!Number.isFinite(channelId)) return null;
    const topicRaw = ops["topic"];
    const topic = topicRaw != null ? decodeHashComponent(topicRaw) : null;
    return { kind: "stream", channelId, topic, nearId };
  }

  const dmRaw = ops["dm"] ?? ops["pm-with"];
  if (dmRaw != null) {
    const otherIds = decodeHashComponent(dmRaw)
      .split(",")
      .map((s) => Number(s.split("-")[0]))
      .filter((n) => Number.isFinite(n));
    if (otherIds.length === 0) return null;
    return { kind: "dm", otherIds, nearId };
  }
  return null;
}

/**
 * Open a parsed Zulip narrow inside Atrium (no Zulip-web round trip). Channels
 * open on the full /zulip surface; DMs open in the right-drawer DM tab. When the
 * target message (`nearId`) is already loaded in that thread its bubble gets a
 * brief highlight; otherwise we just open the thread (the message may be older
 * than the loaded window). `navigate` is react-router's navigate.
 */
export function jumpToZulipNarrow(
  target: ZulipNarrowTarget,
  navigate: (path: string) => void,
): void {
  const store = useStore.getState();
  if (target.kind === "stream") {
    store.setZulipActiveChannel(target.channelId, target.topic);
    navigate("/zulip");
  } else {
    const selfId = store.zulipSelfId;
    const ids = selfId != null ? [selfId, ...target.otherIds] : target.otherIds;
    store.setZulipActiveDmParticipants(ids);
    store.setChatOpen(true);
    store.setChatView("zulip-dm");
  }
  if (target.nearId != null) highlightMessageSoon(String(target.nearId));
}

// Briefly outline the target message bubble once it's in the DOM (it may need a
// tick to mount after the thread opens). Best-effort: if the message isn't in the
// loaded window there's nothing to highlight, and we simply leave the thread open.
function highlightMessageSoon(messageId: string): void {
  let tries = 0;
  const tick = () => {
    const el = document.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("zulip-jump-highlight");
      window.setTimeout(() => el.classList.remove("zulip-jump-highlight"), 2000);
      return;
    }
    if (tries++ < 20) window.setTimeout(tick, 100);
  };
  window.setTimeout(tick, 50);
}

/**
 * Zulip's verified quote-and-reply markup:
 *   @_**Name|ID** [said](narrow):
 *   ```quote
 *   <original message as plain text>
 *   ```
 * `@_` is the silent-mention form (links the sender without pinging them). The
 * caller inserts this into the composer; the user types their reply below it.
 */
export function buildQuoteReply({
  senderName,
  senderUserId,
  narrowUrl,
  originalHtml,
}: {
  senderName: string;
  senderUserId: number;
  narrowUrl: string;
  originalHtml: string;
}): string {
  const quoted = plainTextFromHtml(originalHtml);
  // Fence with more backticks than the longest backtick run inside the quoted
  // body (the standard fenced-code rule Zulip itself follows). A fixed 3-backtick
  // fence would be prematurely closed by a quoted message that contains ``` —
  // breaking the quote block open.
  const longestRun = (quoted.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `@_**${senderName}|${senderUserId}** [said](${narrowUrl}):\n${fence}quote\n${quoted}\n${fence}\n\n`;
}

// The imperative handle ZulipChannelView/ZulipDmView use to drop quote-reply
// markup into the composer and focus it.
export interface ComposerHandle {
  insertAtCaret: (text: string) => void;
  focus: () => void;
}

// What a Reply click hands back to the owning view so it can build the right
// narrow URL (channel vs DM) and the quote markup.
export interface ReplyTarget {
  messageId: string;
  senderName: string;
  senderUserId: number;
  bodyHtml: string;
}

// A run of consecutive messages from one sender, within MERGE_WINDOW_MS. The
// avatar + name + time render once per run; the bodies stack tightly beneath.
interface MessageRun {
  senderId: string;
  senderName: string;
  senderImageUrl?: string;
  isOwn: boolean;
  messages: ChatMessage[];
}

const MERGE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Partition messages into runs of consecutive same-sender messages no more than
 * MERGE_WINDOW_MS apart, so the stream reads like Zulip/Slack: one avatar+name
 * header per run, bodies stacked beneath. A new sender or a large gap breaks the
 * run. Order is preserved (array order is display order).
 */
function groupConsecutiveMessages(messages: ChatMessage[], meId: string): MessageRun[] {
  const runs: MessageRun[] = [];
  for (const msg of messages) {
    const last = runs[runs.length - 1];
    const prevMsg = last?.messages[last.messages.length - 1];
    const gap = prevMsg
      ? new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime()
      : Infinity;
    if (last && last.senderId === msg.sender.id && gap < MERGE_WINDOW_MS) {
      last.messages.push(msg);
    } else {
      runs.push({
        senderId: msg.sender.id,
        senderName: msg.sender.name,
        senderImageUrl: msg.sender.imageUrl,
        isOwn: msg.sender.id === meId,
        messages: [msg],
      });
    }
  }
  return runs;
}

/** Compact HH:MM for a run header, in the reader's locale. */
function formatRunTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Shared message stream + composer used by both the right-drawer chat tabs and
 * the full-page Zulip client. Kept presentation-only: callers own data + send.
 * Consecutive same-sender messages merge into one avatar+name block.
 */
export function MessageList({
  messages,
  meId,
  onReply,
}: {
  messages: ChatMessage[];
  meId: string;
  onReply?: (target: ReplyTarget) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const navigate = useNavigate();

  // Intercept clicks on Zulip-narrow links (quote-reply "said" links, mentions
  // of a conversation, etc.) and jump WITHIN Atrium instead of bouncing to the
  // Zulip web app. Any non-narrow link falls through to its normal new-tab open.
  const onBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!href) return;
    const target = parseZulipNarrow(href);
    if (!target) return;
    e.preventDefault();
    jumpToZulipNarrow(target, navigate);
  };

  const runs = groupConsecutiveMessages(messages, meId);

  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto", p: 2 }}>
      <Stack spacing={1.5}>
        {runs.map((run) => (
          <Stack
            key={run.messages[0]!.id}
            direction={run.isOwn ? "row-reverse" : "row"}
            spacing={1}
            alignItems="flex-start"
          >
            <Tooltip title={run.senderName}>
              <Avatar src={run.senderImageUrl} sx={{ width: 28, height: 28, mt: 0.25, flexShrink: 0 }}>
                {run.senderName.charAt(0)}
              </Avatar>
            </Tooltip>
            <Stack
              spacing={0.25}
              sx={{ maxWidth: "75%", alignItems: run.isOwn ? "flex-end" : "flex-start" }}
            >
              <Stack
                direction={run.isOwn ? "row-reverse" : "row"}
                spacing={0.75}
                alignItems="baseline"
                sx={{ px: 0.5 }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {run.senderName}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                  {formatRunTime(run.messages[0]!.createdAt)}
                </Typography>
              </Stack>
              {run.messages.map((m) => {
                const rendered = renderBody(m.body);
                // Zulip sender id arrives as "zulip:NN"; pull the numeric id for
                // the quote-reply silent-mention markup.
                const senderUserId = Number(m.sender.id.split(":")[1]);
                return (
                  <Box
                    key={m.id}
                    data-message-id={m.id}
                    sx={{
                      position: "relative",
                      bgcolor: run.isOwn ? "primary.main" : "action.hover",
                      transition: "box-shadow 0.2s, background-color 0.2s",
                      "&.zulip-jump-highlight": {
                        boxShadow: (t) => `0 0 0 2px ${t.palette.warning.main}`,
                      },
                      color: run.isOwn ? "primary.contrastText" : "text.primary",
                      px: 1.5,
                      py: 0.75,
                      borderRadius: 2,
                      wordBreak: "break-word",
                      "&:hover .reply-btn": { opacity: 1 },
                    }}
                  >
                    {onReply && Number.isFinite(senderUserId) && (
                      <Tooltip title="Reply with quote">
                        <IconButton
                          className="reply-btn"
                          size="small"
                          onClick={() =>
                            onReply({
                              messageId: m.id,
                              senderName: m.sender.name,
                              senderUserId,
                              bodyHtml: m.body,
                            })
                          }
                          sx={{
                            position: "absolute",
                            top: -10,
                            [run.isOwn ? "left" : "right"]: -10,
                            opacity: 0,
                            transition: "opacity 0.12s",
                            bgcolor: "background.paper",
                            border: 1,
                            borderColor: "divider",
                            boxShadow: 1,
                            "&:hover": { bgcolor: "background.paper" },
                          }}
                          aria-label="Reply with quote"
                        >
                          <ReplyIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {rendered ? (
                      <Box
                        component="div"
                        onClick={onBodyClick}
                        dangerouslySetInnerHTML={{ __html: rendered.html }}
                        sx={{
                          fontSize: "0.875rem",
                          lineHeight: 1.5,
                          "& p": { m: "4px 0" },
                          "& p:first-of-type": { mt: 0 },
                          "& p:last-of-type": { mb: 0 },
                          "& a": { color: "inherit", textDecoration: "underline" },
                          "& code": {
                            fontFamily: "monospace",
                            fontSize: "0.85em",
                            bgcolor: run.isOwn ? "rgba(255,255,255,0.2)" : "action.hover",
                            px: 0.5,
                            borderRadius: 0.5,
                          },
                          "& pre": {
                            fontFamily: "monospace",
                            bgcolor: run.isOwn ? "rgba(255,255,255,0.2)" : "action.hover",
                            p: 1,
                            borderRadius: 1,
                            overflow: "auto",
                            my: 0.5,
                          },
                          "& pre code": { bgcolor: "transparent", p: 0 },
                          // Zulip quote-reply blocks: a blockquote preceded by an
                          // "@_**Name** said:" attribution. Render as a distinct
                          // indented, tinted block so quoted context reads apart
                          // from the reply.
                          "& blockquote": {
                            borderLeft: "4px solid",
                            borderColor: run.isOwn ? "rgba(255,255,255,0.5)" : "primary.main",
                            bgcolor: run.isOwn ? "rgba(255,255,255,0.12)" : "action.hover",
                            borderRadius: "0 4px 4px 0",
                            pl: 1.5,
                            pr: 1,
                            py: 0.75,
                            my: 0.75,
                            ml: 0,
                            "& p:first-of-type": { mt: 0 },
                            "& p:last-of-type": { mb: 0 },
                            "& strong": { fontWeight: 700 },
                          },
                          // Nested quotes recede further.
                          "& blockquote blockquote": { opacity: 0.85 },
                          "& .user-mention": {
                            bgcolor: run.isOwn ? "rgba(255,255,255,0.2)" : "action.selected",
                            px: 0.5,
                            borderRadius: 0.5,
                            fontWeight: 500,
                          },
                          "& img": {
                            maxWidth: "100%",
                            maxHeight: 360,
                            borderRadius: 1,
                            display: "block",
                            my: 0.5,
                          },
                          "& ul, & ol": { pl: 2.5, my: 0.5 },
                        }}
                      />
                    ) : (
                      <Typography variant="body2">{m.body}</Typography>
                    )}
                  </Box>
                );
              })}
            </Stack>
          </Stack>
        ))}
        <div ref={bottomRef} />
      </Stack>
    </Box>
  );
}

// An autocomplete candidate — a Zulip user, user group, or channel — normalized
// so the suggestion list and insertion logic don't care which kind it is.
interface MentionItem {
  kind: "user" | "group" | "channel";
  id: number;
  name: string;
  detail?: string; // email for users, member count for groups, "channel" for channels
  imageUrl?: string;
  // The exact markup Zulip renders on receipt.
  // user: `@**Full Name**`  group: `@*group-name*`  channel: `#**Channel Name**`
  markup: string;
}

const MENTION_LIMIT = 8;

// Trigger characters and what each completes against.
type TriggerChar = "@" | "#";

/** Open autocomplete state: the trigger char + its position + the typed query. */
interface MentionState {
  trigger: TriggerChar;
  at: number; // index of the trigger char in body
  query: string; // text typed after the trigger (before caret)
}

// Find an active autocomplete token immediately before the caret. A token is a
// trigger char ("@" or "#") plus the run of characters after it up to the caret.
// It's active only when the trigger is at the start or preceded by whitespace,
// so emails (a@b) and mid-word "#" never trigger it. Crucially we DON'T abort on
// an internal "@"/email: we scan back to the nearest whitespace and inspect the
// first char of the token, so "type @" with no query still opens the popup.
function detectMention(value: string, caret: number): MentionState | null {
  // Walk back to the start of the current whitespace-delimited token.
  let start = caret;
  while (start > 0 && !/\s/.test(value[start - 1]!)) start -= 1;
  const first = value[start];
  if (first !== "@" && first !== "#") return null;
  const before = start === 0 ? " " : value[start - 1]!;
  if (!/\s/.test(before)) return null;
  const query = value.slice(start + 1, caret);
  // A query containing whitespace can't be an open token (we'd have stopped at
  // the whitespace above), so query here is always a single run — safe to use.
  return { trigger: first, at: start, query };
}

export const Composer = forwardRef<
  ComposerHandle,
  { disabled?: boolean; onSend: (body: string) => void }
>(function Composer({ disabled, onSend }, ref) {
  const zulipUsers = useStore((s) => s.zulipUsers);
  const zulipUserGroups = useStore((s) => s.zulipUserGroups);
  const zulipChannels = useStore((s) => s.zulipChannels);

  const [body, setBody] = useState("");
  const [mention, setMention] = useState<MentionState | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  // The @-mention popup needs the org's users/groups to be loaded. They arrive
  // via the zulip:fetch-users round-trip on connect, but a composer that mounts
  // before that (or in a tab that never opened the DM list) would have an empty
  // candidate set, so typing "@" produced silence. Request them on mount when
  // they're missing so the popup always has something to show. Cheap + idempotent
  // server-side; the store dedupes the resulting snapshot.
  useEffect(() => {
    if (zulipUsers.length === 0) getSocket().emit("zulip:fetch-users");
    if (zulipChannels.length === 0) getSocket().emit("zulip:fetch-channels");
  }, [zulipUsers.length, zulipChannels.length]);

  // Build the @-mention candidate set (users + groups) once per change.
  const mentionCandidates = useMemo<MentionItem[]>(() => {
    const users: MentionItem[] = zulipUsers.map((u: ZulipUser) => ({
      kind: "user" as const,
      id: u.zulipUserId,
      name: u.name,
      detail: u.email,
      imageUrl: u.imageUrl,
      markup: `@**${u.name}**`,
    }));
    const groups: MentionItem[] = zulipUserGroups.map((g: ZulipUserGroup) => ({
      kind: "group" as const,
      id: g.id,
      name: g.name,
      detail: `${g.memberIds.length} member${g.memberIds.length === 1 ? "" : "s"}`,
      markup: `@*${g.name}*`,
    }));
    return [...users, ...groups];
  }, [zulipUsers, zulipUserGroups]);

  // Build the #-channel candidate set. Zulip's channel-link markup is
  // `#**Channel Name**` (verified at zulip.com/api).
  const channelCandidates = useMemo<MentionItem[]>(
    () =>
      zulipChannels.map((c: ZulipChannel) => ({
        kind: "channel" as const,
        id: c.id,
        name: c.name,
        detail: "channel",
        markup: `#**${c.name}**`,
      })),
    [zulipChannels],
  );

  const suggestions = useMemo<MentionItem[]>(() => {
    if (!mention) return [];
    const pool = mention.trigger === "#" ? channelCandidates : mentionCandidates;
    const q = mention.query.trim().toLowerCase();
    const matches = q
      ? pool.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.detail?.toLowerCase().includes(q) ?? false),
        )
      : pool;
    return matches.slice(0, MENTION_LIMIT);
  }, [mention, mentionCandidates, channelCandidates]);

  const mentionOpen = mention != null && suggestions.length > 0;

  useEffect(() => {
    setHighlight(0);
  }, [mention?.query, mention?.at]);

  // Insert text at the current caret, replacing an optional [start,end) range,
  // and place the caret right after the inserted text on the next tick.
  const insertAtCaret = (text: string, replaceStart?: number, replaceEnd?: number) => {
    const el = inputRef.current;
    const start = replaceStart ?? el?.selectionStart ?? body.length;
    const end = replaceEnd ?? el?.selectionEnd ?? start;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    const caret = start + text.length;
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(caret, caret);
      }
    });
  };

  // Expose insert/focus so a Reply action can drop quote-and-reply markup at the
  // caret and bring the composer into focus.
  useImperativeHandle(
    ref,
    () => ({
      insertAtCaret: (text: string) => insertAtCaret(text),
      focus: () => inputRef.current?.focus(),
    }),
    [],
  );

  const applyMention = (item: MentionItem) => {
    if (!mention) return;
    const el = inputRef.current;
    const caret = el?.selectionEnd ?? mention.at + 1 + mention.query.length;
    // Replace the trigger + typed query with the markup, then a trailing space.
    insertAtCaret(item.markup + " ", mention.at, caret);
    setMention(null);
  };

  // Wrap the current selection (or the caret position) in Zulip markdown. When
  // there's a selection it's wrapped in place; with no selection, the markers
  // are inserted and the caret lands between them so the user types inside.
  const wrapSelection = (before: string, after: string, placeholder = "") => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? start;
    const selected = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + selected + after + body.slice(end);
    setBody(next);
    setMention(null);
    // Caret: if we had a selection, place it after the wrapped text; otherwise
    // drop it between the markers (or after the placeholder) so typing continues.
    const caret =
      end > start ? start + before.length + selected.length + after.length : start + before.length + selected.length;
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(caret, caret);
      }
    });
  };

  // A fenced code block wants its own lines. Insert ```\n<sel>\n``` and leave the
  // caret on the (possibly empty) content line.
  const insertCodeBlock = () => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? start;
    const selected = body.slice(start, end);
    // Pad with newlines so the fence sits on its own line, but don't double up if
    // we're already at a line start / the body is empty.
    const needsLeadingNl = start > 0 && body[start - 1] !== "\n";
    const open = (needsLeadingNl ? "\n" : "") + "```\n";
    const close = "\n```\n";
    const next = body.slice(0, start) + open + selected + close + body.slice(end);
    setBody(next);
    setMention(null);
    const caret = start + open.length + selected.length;
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(caret, caret);
      }
    });
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setBody(value);
    const caret = e.target.selectionStart ?? value.length;
    setMention(detectMention(value, caret));
  };

  const send = () => {
    const trimmed = body.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setBody("");
    setMention(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Formatting shortcuts (Ctrl/Cmd + B / I / E for inline code).
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        wrapSelection("**", "**", "bold");
        return;
      }
      if (k === "i") {
        e.preventDefault();
        wrapSelection("*", "*", "italic");
        return;
      }
      if (k === "e") {
        e.preventDefault();
        wrapSelection("`", "`", "code");
        return;
      }
    }
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = suggestions[highlight];
        if (pick) applyMention(pick);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ── File upload ──
  const uploadFile = async (file: File) => {
    if (disabled || uploading) return;
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch("/api/zulip/upload-file", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setUploadError(err?.error ?? "Upload failed.");
        return;
      }
      const { uri } = (await res.json()) as { uri: string };
      const isImage = file.type.startsWith("image/");
      const name = file.name || "file";
      // Zulip auto-embeds images from a markdown image link; other files render
      // as a download link.
      insertAtCaret(`${isImage ? "!" : ""}[${name}](${uri}) `);
    } catch {
      setUploadError("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = ""; // allow re-picking the same file
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files)[0];
    if (file) {
      e.preventDefault();
      void uploadFile(file);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    const file = Array.from(e.dataTransfer.files)[0];
    if (file) {
      e.preventDefault();
      void uploadFile(file);
    }
  };

  return (
    <Box
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      sx={{ borderTop: 1, borderColor: "divider" }}
    >
      {uploadError && (
        <Typography variant="caption" color="error" sx={{ px: 2, pt: 0.5, display: "block" }}>
          {uploadError}
        </Typography>
      )}
      <Stack direction="row" spacing={0.25} sx={{ px: 1, pt: 0.5 }}>
        <Tooltip title="Bold (Ctrl/Cmd+B)">
          <span>
            <IconButton size="small" disabled={disabled} onClick={() => wrapSelection("**", "**", "bold")}>
              <FormatBoldIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Italic (Ctrl/Cmd+I)">
          <span>
            <IconButton size="small" disabled={disabled} onClick={() => wrapSelection("*", "*", "italic")}>
              <FormatItalicIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Inline code (Ctrl/Cmd+E)">
          <span>
            <IconButton size="small" disabled={disabled} onClick={() => wrapSelection("`", "`", "code")}>
              <CodeIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Code block">
          <span>
            <IconButton size="small" disabled={disabled} onClick={insertCodeBlock}>
              <DataObjectIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ px: 1, pb: 1 }} ref={anchorRef}>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={onFilePick}
        />
        <Tooltip title="Attach a file">
          <span>
            <IconButton
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
              size="small"
            >
              {uploading ? <CircularProgress size={20} /> : <AttachFileIcon />}
            </IconButton>
          </span>
        </Tooltip>
        <TextField
          size="small"
          fullWidth
          inputRef={inputRef}
          value={body}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            disabled
              ? "Pick a conversation…"
              : uploading
                ? "Uploading…"
                : "Type a message…"
          }
          disabled={disabled}
          multiline
          maxRows={4}
        />
        <IconButton color="primary" onClick={send} disabled={disabled}>
          <SendIcon />
        </IconButton>
      </Stack>
      <Popper
        open={mentionOpen}
        anchorEl={anchorRef.current}
        placement="top-start"
        style={{ zIndex: 1400, width: anchorRef.current?.clientWidth }}
      >
        <Paper elevation={4} sx={{ maxHeight: 240, overflowY: "auto", m: 0.5 }}>
          <List dense disablePadding>
            {suggestions.map((item, idx) => (
              <ListItemButton
                key={`${item.kind}-${item.id}`}
                selected={idx === highlight}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  applyMention(item);
                }}
              >
                {item.kind === "user" ? (
                  <Avatar src={item.imageUrl} sx={{ width: 24, height: 24, mr: 1 }}>
                    {item.name.charAt(0)}
                  </Avatar>
                ) : item.kind === "channel" ? (
                  <Avatar sx={{ width: 24, height: 24, mr: 1 }}>
                    <TagIcon sx={{ fontSize: 16 }} />
                  </Avatar>
                ) : (
                  <Avatar sx={{ width: 24, height: 24, mr: 1 }}>
                    <GroupIcon sx={{ fontSize: 16 }} />
                  </Avatar>
                )}
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {item.name}
                  </Typography>
                  {item.detail && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                      {item.detail}
                    </Typography>
                  )}
                </Box>
              </ListItemButton>
            ))}
          </List>
        </Paper>
      </Popper>
    </Box>
  );
});

export const openZulip = () =>
  window.open("https://grc.zulipchat.com", "_blank", "noopener");
