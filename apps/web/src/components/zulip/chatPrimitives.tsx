import { useEffect, useMemo, useRef, useState } from "react";
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
import DOMPurify from "dompurify";
import type { ChatMessage, ZulipUser, ZulipUserGroup } from "@atrium/shared";
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
export function MessageList({ messages, meId }: { messages: ChatMessage[]; meId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

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
                return (
                  <Box
                    key={m.id}
                    sx={{
                      bgcolor: run.isOwn ? "primary.main" : "action.hover",
                      color: run.isOwn ? "primary.contrastText" : "text.primary",
                      px: 1.5,
                      py: 0.75,
                      borderRadius: 2,
                      wordBreak: "break-word",
                    }}
                  >
                    {rendered ? (
                      <Box
                        component="div"
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
                          "& blockquote": {
                            borderLeft: 3,
                            borderColor: "divider",
                            pl: 1,
                            my: 0.5,
                            opacity: 0.85,
                          },
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

// A mention candidate — either a Zulip user or a user group — normalized so the
// suggestion list and insertion logic don't care which kind it is.
interface MentionItem {
  kind: "user" | "group";
  id: number;
  name: string;
  detail?: string; // email for users, member count for groups
  imageUrl?: string;
  // The exact markup Zulip renders to a mention span on receipt.
  markup: string; // `@**Full Name**` (user) / `@*group-name*` (group)
}

const MENTION_LIMIT = 8;

/** Open mention state: the "@" position in the body and the typed query after it. */
interface MentionState {
  at: number; // index of the "@" in body
  query: string; // text typed after "@" (before caret)
}

// Find an active "@mention" token immediately before the caret. A token is the
// "@" plus the run of non-whitespace after it; it's active only when the "@" is
// at the start or preceded by whitespace (so emails like a@b don't trigger it).
function detectMention(value: string, caret: number): MentionState | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i]!;
    if (ch === "@") {
      const before = i === 0 ? " " : value[i - 1]!;
      if (!/\s/.test(before)) return null;
      return { at: i, query: value.slice(i + 1, caret) };
    }
    if (/\s/.test(ch)) return null;
    i -= 1;
  }
  return null;
}

export function Composer({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (body: string) => void;
}) {
  const zulipUsers = useStore((s) => s.zulipUsers);
  const zulipUserGroups = useStore((s) => s.zulipUserGroups);

  const [body, setBody] = useState("");
  const [mention, setMention] = useState<MentionState | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  // Build the full candidate set once per users/groups change; filter per query.
  const allCandidates = useMemo<MentionItem[]>(() => {
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

  const suggestions = useMemo<MentionItem[]>(() => {
    if (!mention) return [];
    const q = mention.query.trim().toLowerCase();
    const matches = q
      ? allCandidates.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.detail?.toLowerCase().includes(q) ?? false),
        )
      : allCandidates;
    return matches.slice(0, MENTION_LIMIT);
  }, [mention, allCandidates]);

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

  const applyMention = (item: MentionItem) => {
    if (!mention) return;
    const el = inputRef.current;
    const caret = el?.selectionEnd ?? mention.at + 1 + mention.query.length;
    // Replace "@" + typed query with the markup, then a trailing space.
    insertAtCaret(item.markup + " ", mention.at, caret);
    setMention(null);
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
      <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ p: 1 }} ref={anchorRef}>
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
}

export const openZulip = () =>
  window.open("https://grc.zulipchat.com", "_blank", "noopener");
