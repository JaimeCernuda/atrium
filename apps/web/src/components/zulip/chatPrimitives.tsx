import { useEffect, useRef, useState } from "react";
import { Avatar, Box, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import type { ChatMessage } from "@atrium/shared";

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
        {messages.map((m) => (
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
              <Typography variant="body2">{m.body}</Typography>
            </Box>
          </Stack>
        ))}
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
