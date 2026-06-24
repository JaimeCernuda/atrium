import { useEffect, useRef, useState } from "react";
import { Avatar, Box, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import DOMPurify from "dompurify";
import type { ChatMessage } from "@atrium/shared";

// Zulip already sanitizes server-side; DOMPurify is defense-in-depth before we
// hand raw HTML to dangerouslySetInnerHTML. Strict allowlist — no script/style,
// no event handlers, no forms.
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

/**
 * Shared message stream + composer used by both the right-drawer chat tabs and
 * the full-page Zulip client. Kept presentation-only: callers own data + send.
 */
export function MessageList({ messages, meId }: { messages: ChatMessage[]; meId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <Box sx={{ flexGrow: 1, overflowY: "auto", p: 2 }}>
      <Stack spacing={1.2}>
        {messages.map((m) => {
          const rendered = renderBody(m.body);
          return (
          <Stack
            key={m.id}
            direction={m.sender.id === meId ? "row-reverse" : "row"}
            spacing={1}
            alignItems="flex-end"
          >
            <Tooltip title={m.sender.name}>
              <Avatar src={m.sender.imageUrl} sx={{ width: 28, height: 28 }}>
                {m.sender.name.charAt(0)}
              </Avatar>
            </Tooltip>
            <Box
              sx={{
                bgcolor: m.sender.id === meId ? "primary.main" : "action.hover",
                color: m.sender.id === meId ? "primary.contrastText" : "text.primary",
                px: 1.5,
                py: 0.75,
                borderRadius: 2,
                maxWidth: "75%",
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
                      bgcolor: "action.hover",
                      px: 0.5,
                      borderRadius: 0.5,
                    },
                    "& pre": {
                      fontFamily: "monospace",
                      bgcolor: "action.hover",
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
                      bgcolor: "action.selected",
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
          </Stack>
          );
        })}
        <div ref={bottomRef} />
      </Stack>
    </Box>
  );
}

export function Composer({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  const send = () => {
    const trimmed = body.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setBody("");
  };
  return (
    <Stack direction="row" spacing={1} sx={{ p: 1, borderTop: 1, borderColor: "divider" }}>
      <TextField
        size="small"
        fullWidth
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={disabled ? "Pick a conversation…" : "Type a message…"}
        disabled={disabled}
        multiline
        maxRows={4}
      />
      <IconButton color="primary" onClick={send} disabled={disabled}>
        <SendIcon />
      </IconButton>
    </Stack>
  );
}

export const openZulip = () =>
  window.open("https://grc.zulipchat.com", "_blank", "noopener");
