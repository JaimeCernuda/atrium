import { useState, useId } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  Dialog,
  FormControlLabel,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import AddLinkIcon from "@mui/icons-material/AddLink";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import BoltIcon from "@mui/icons-material/Bolt";
import type { OfficeDecoration, OfficeLink, Room } from "@atrium/shared";
import { useStore } from "../store";
import { buildCardBg, buildBorderSx, LINK_ICON } from "./officeDecoUtils";

// ─── colour presets ────────────────────────────────────────────────────────
const BG_PRESETS = [
  "#ffffff","#fafafa","#f3e5f5","#e3f2fd","#e8f5e9",
  "#fff8e1","#fce4ec","#e0f7fa","#f1f8e9","#ede7f6",
  "#e8eaf6","#fff3e0","#f9fbe7","#e0f2f1","#fbe9e7",
];
const ACCENT_PRESETS = [
  "#7b1fa2","#1976d2","#388e3c","#f57c00","#c62828",
  "#00796b","#5d4037","#0288d1","#ad1457","#546e7a",
  "#283593","#6a1b9a","#2e7d32","#e65100","#37474f",
];

const EMOJI_SUGGESTIONS = [
  "🔬","🎯","☕","📚","💡","🧪","🖥️","📊","🎨","🏆",
  "🚀","🌱","🔭","⚙️","📐","🎓","🧑‍💻","💻","🌐","🔐",
];

const GRADIENT_ANGLES = [
  { label: "→",  value: 90 },
  { label: "↘",  value: 135 },
  { label: "↓",  value: 180 },
  { label: "↙",  value: 225 },
  { label: "←",  value: 270 },
];

const PATTERN_OPTIONS: { value: "dots" | "stripes" | "grid"; label: string; preview: string }[] = [
  {
    value: "dots",
    label: "Dots",
    preview: "radial-gradient(circle, rgba(0,0,0,0.25) 1px, transparent 1px) 0 0/10px 10px",
  },
  {
    value: "stripes",
    label: "Stripes",
    preview:
      "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.18) 5px, rgba(0,0,0,0.18) 10px)",
  },
  {
    value: "grid",
    label: "Grid",
    preview:
      "linear-gradient(rgba(0,0,0,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.18) 1px, transparent 1px) 0 0/10px 10px",
  },
];

// ─── colour swatch ─────────────────────────────────────────────────────────
function Swatch({
  colors, value, onChange,
}: { colors: string[]; value?: string; onChange: (c: string) => void }) {
  return (
    <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
      {colors.map((c) => (
        <Tooltip key={c} title={c}>
          <Box
            onClick={() => onChange(c)}
            sx={{
              width: 22, height: 22, borderRadius: 0.75, bgcolor: c, cursor: "pointer",
              border: value === c ? "2.5px solid" : "1.5px solid rgba(0,0,0,0.15)",
              borderColor: value === c ? "primary.main" : undefined,
              flexShrink: 0,
              "&:hover": { transform: "scale(1.18)", transition: "transform 100ms" },
            }}
          />
        </Tooltip>
      ))}
      <Tooltip title="Custom colour">
        <Box
          component="input" type="color"
          value={value ?? "#ffffff"}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
          sx={{
            width: 22, height: 22, border: "1.5px solid rgba(0,0,0,0.18)",
            borderRadius: 0.75, padding: 0, cursor: "pointer", flexShrink: 0,
          }}
        />
      </Tooltip>
      {value && (
        <Button size="small" sx={{ p: 0, minWidth: 0, fontSize: 11 }}
          onClick={() => onChange("")}>clear</Button>
      )}
    </Stack>
  );
}

// ─── mini card preview ─────────────────────────────────────────────────────
function CardPreview({ deco, roomName }: { deco: OfficeDecoration; roomName: string }) {
  const bg = buildCardBg(deco);
  const border = buildBorderSx(deco);
  return (
    <Box
      sx={{
        borderRadius: 1.5, border: "1px solid", borderColor: "divider",
        p: 1, minWidth: 200, maxWidth: 240,
        ...bg, ...border,
        boxShadow: deco.glow
          ? `0 0 14px 3px ${(deco.accentColor ?? "#7b1fa2")}55`
          : undefined,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {deco.emoji && <Typography sx={{ fontSize: 15, lineHeight: 1 }}>{deco.emoji}</Typography>}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: deco.nameColor || undefined,
            fontStyle: deco.nameItalic ? "italic" : undefined,
            textTransform: deco.nameUppercase ? "uppercase" : undefined,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {roomName}
        </Typography>
      </Stack>
      {deco.motto && (
        <Typography variant="caption" sx={{ fontStyle: "italic", color: "text.secondary", display: "block", mt: 0.25 }}>
          {deco.motto}
        </Typography>
      )}
      {deco.badge && (
        <Box sx={{
          display: "inline-block", mt: 0.5, px: 0.75, py: 0.125,
          borderRadius: 999, bgcolor: deco.badgeColor ?? "#7b1fa2", color: "#fff",
        }}>
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 10 }}>{deco.badge}</Typography>
        </Box>
      )}
      {deco.links && deco.links.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.75 }}>
          {deco.links.slice(0, 4).map((l) => (
            <Chip
              key={l.id}
              label={`${LINK_ICON(l.url)} ${l.label}`}
              size="small"
              sx={{ fontSize: 10, height: 20, cursor: "pointer" }}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

// ─── main dialog ───────────────────────────────────────────────────────────
interface Props { room: Room; open: boolean; onClose: () => void }

export function OfficeDecorateDialog({ room, open, onClose }: Props) {
  const setRooms = useStore((s) => s.setRooms);
  const rooms = useStore((s) => s.rooms);
  const uid = useId();

  const init = room.decorations ?? {};
  const [bgColor, setBgColor]           = useState(init.bgColor ?? "");
  const [useGradient, setUseGradient]   = useState(!!init.bgGradient);
  const [gradFrom, setGradFrom]         = useState(init.bgGradient?.from ?? "#e3f2fd");
  const [gradTo, setGradTo]             = useState(init.bgGradient?.to ?? "#f3e5f5");
  const [gradAngle, setGradAngle]       = useState(init.bgGradient?.angle ?? 135);
  const [bgPattern, setBgPattern]       = useState<"dots"|"stripes"|"grid"|"">(init.bgPattern ?? "");
  const [accentColor, setAccentColor]   = useState(init.accentColor ?? "");
  const [borderStyle, setBorderStyle]   = useState<"solid"|"dashed"|"dotted">(init.borderStyle ?? "solid");
  const [borderWidth, setBorderWidth]   = useState<2|4|6>(init.borderWidth ?? 4);
  const [glow, setGlow]                 = useState(init.glow ?? false);
  const [emoji, setEmoji]               = useState(init.emoji ?? "");
  const [badge, setBadge]               = useState(init.badge ?? "");
  const [badgeColor, setBadgeColor]     = useState(init.badgeColor ?? "#7b1fa2");
  const [motto, setMotto]               = useState(init.motto ?? "");
  const [nameColor, setNameColor]       = useState(init.nameColor ?? "");
  const [nameUppercase, setNameUppercase] = useState(init.nameUppercase ?? false);
  const [nameItalic, setNameItalic]     = useState(init.nameItalic ?? false);
  const [links, setLinks]               = useState<OfficeLink[]>(init.links ?? []);
  const [newLabel, setNewLabel]         = useState("");
  const [newUrl, setNewUrl]             = useState("");
  const [urlError, setUrlError]         = useState("");
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState<string | null>(null);

  // Desks also configure their Zulip channel bindings from this same dialog
  // (owner-only). Not a separate button.
  const zulipChannels = useStore((s) => s.zulipChannels);
  const isDesk = (room.category ?? "").toLowerCase() === "desks";
  const boundInit =
    room.zulipStreamIds && room.zulipStreamIds.length
      ? room.zulipStreamIds
      : room.zulipStreamId != null
        ? [room.zulipStreamId]
        : [];
  const [channels, setChannels] = useState<number[]>(boundInit);

  const deco: OfficeDecoration = {
    ...(useGradient
      ? { bgGradient: { from: gradFrom, to: gradTo, angle: gradAngle } }
      : bgColor ? { bgColor } : {}),
    ...(bgPattern ? { bgPattern } : {}),
    ...(accentColor ? { accentColor } : {}),
    borderStyle,
    borderWidth,
    ...(glow ? { glow } : {}),
    ...(emoji ? { emoji } : {}),
    ...(badge ? { badge, badgeColor } : {}),
    ...(motto ? { motto } : {}),
    ...(nameColor ? { nameColor } : {}),
    ...(nameUppercase ? { nameUppercase } : {}),
    ...(nameItalic ? { nameItalic } : {}),
    ...(links.length ? { links } : {}),
  };

  const addLink = () => {
    setUrlError("");
    if (!newLabel.trim()) { setUrlError("Label is required"); return; }
    try { new URL(newUrl); } catch { setUrlError("Enter a valid URL (include https://)"); return; }
    if (links.length >= 8) { setUrlError("Max 8 links"); return; }
    setLinks([...links, { id: `${uid}-${Date.now()}`, label: newLabel.trim(), url: newUrl.trim() }]);
    setNewLabel(""); setNewUrl("");
  };

  const removeLink = (id: string) => setLinks(links.filter((l) => l.id !== id));

  const save = async () => {
    setSaving(true); setSaveError(null);
    try {
      // Desk channel bindings persist first so the decorate response reflects them.
      if (isDesk) {
        const a = [...channels].sort((x, y) => x - y);
        const b = [...boundInit].sort((x, y) => x - y);
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
          const cr = await fetch(`/api/rooms/${room.id}/channels`, {
            method: "PATCH", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ zulipStreamIds: channels }),
          });
          if (!cr.ok) {
            const body = await cr.json().catch(() => ({}));
            setSaveError((body as { error?: string }).error ?? "Failed to save channels");
            return;
          }
        }
      }
      const res = await fetch(`/api/rooms/${room.id}/decorate`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deco),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError((body as { error?: string }).error ?? "Failed to save");
        return;
      }
      const updated = (await res.json()) as Room;
      setRooms(rooms.map((r) => (r.id === updated.id ? updated : r)));
      onClose();
    } finally { setSaving(false); }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}/decorate`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as Room;
      setRooms(rooms.map((r) => (r.id === updated.id ? updated : r)));
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { maxHeight: "92vh" } }}>
      <DialogTitle sx={{ pb: 1 }}>
        {isDesk ? "Customize your desk" : "Decorate your office"}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          {room.name}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {/* Live preview */}
        <Box sx={{ px: 3, pt: 1, pb: 2, borderBottom: "1px solid", borderColor: "divider" }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <CardPreview deco={deco} roomName={room.name} />
            <Typography variant="caption" color="text.secondary">Live preview</Typography>
          </Stack>
        </Box>

        {/* ── Background ───────────────────────────────────── */}
        <Accordion defaultExpanded disableGutters elevation={0}
          sx={{ "&::before": { display: "none" }, borderBottom: "1px solid", borderColor: "divider" }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Background</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 52 }}>
                  {useGradient ? "Gradient" : "Solid"}
                </Typography>
                <Switch size="small" checked={useGradient}
                  onChange={(e) => setUseGradient(e.target.checked)} />
              </Stack>

              {!useGradient ? (
                <>
                  <Typography variant="caption" color="text.secondary">Background colour</Typography>
                  <Swatch colors={BG_PRESETS} value={bgColor} onChange={setBgColor} />
                </>
              ) : (
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">From</Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <Swatch colors={BG_PRESETS.slice(0, 8)} value={gradFrom} onChange={setGradFrom} />
                      </Box>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">To</Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <Swatch colors={BG_PRESETS.slice(7)} value={gradTo} onChange={setGradTo} />
                      </Box>
                    </Box>
                  </Stack>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Direction</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                      {GRADIENT_ANGLES.map((a) => (
                        <Button key={a.value} size="small"
                          variant={gradAngle === a.value ? "contained" : "outlined"}
                          sx={{ minWidth: 36, fontSize: 16 }}
                          onClick={() => setGradAngle(a.value)}>{a.label}</Button>
                      ))}
                    </Stack>
                  </Box>
                </Stack>
              )}

              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                  Pattern overlay
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small"
                    variant={!bgPattern ? "contained" : "outlined"}
                    onClick={() => setBgPattern("")}>None</Button>
                  {PATTERN_OPTIONS.map((p) => (
                    <Tooltip key={p.value} title={p.label}>
                      <Box
                        onClick={() => setBgPattern(bgPattern === p.value ? "" : p.value)}
                        sx={{
                          width: 40, height: 32, borderRadius: 1, cursor: "pointer",
                          border: bgPattern === p.value ? "2.5px solid" : "1.5px solid rgba(0,0,0,0.2)",
                          borderColor: bgPattern === p.value ? "primary.main" : undefined,
                          background: p.preview,
                          bgcolor: "white",
                        }}
                      />
                    </Tooltip>
                  ))}
                </Stack>
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* ── Border & Effects ─────────────────────────────── */}
        <Accordion disableGutters elevation={0}
          sx={{ "&::before": { display: "none" }, borderBottom: "1px solid", borderColor: "divider" }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Border &amp; Effects</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                  Accent colour (left border)
                </Typography>
                <Swatch colors={ACCENT_PRESETS} value={accentColor} onChange={setAccentColor} />
              </Box>
              <Divider />
              <Stack direction="row" spacing={3}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                    Border style
                  </Typography>
                  <ButtonGroup size="small">
                    {(["solid","dashed","dotted"] as const).map((s) => (
                      <Button key={s}
                        variant={borderStyle === s ? "contained" : "outlined"}
                        onClick={() => setBorderStyle(s)}
                        sx={{ textTransform: "none", minWidth: 60 }}>
                        {s}
                      </Button>
                    ))}
                  </ButtonGroup>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                    Border width
                  </Typography>
                  <ButtonGroup size="small">
                    {([2, 4, 6] as const).map((w) => (
                      <Button key={w}
                        variant={borderWidth === w ? "contained" : "outlined"}
                        onClick={() => setBorderWidth(w)}
                        sx={{ minWidth: 40 }}>
                        {w === 2 ? "─" : w === 4 ? "━" : "▬"}
                      </Button>
                    ))}
                  </ButtonGroup>
                </Box>
              </Stack>
              <Divider />
              <Stack direction="row" alignItems="center" spacing={1}>
                <BoltIcon fontSize="small" sx={{ color: "warning.main" }} />
                <Typography variant="body2">Glow effect</Typography>
                <Switch size="small" checked={glow} onChange={(e) => setGlow(e.target.checked)} />
              </Stack>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* ── Identity ─────────────────────────────────────── */}
        <Accordion disableGutters elevation={0}
          sx={{ "&::before": { display: "none" }, borderBottom: "1px solid", borderColor: "divider" }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Identity</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              {/* Emoji */}
              <Box>
                <TextField label="Decoration emoji" value={emoji}
                  onChange={(e) => setEmoji(e.target.value.slice(0, 8))}
                  size="small" inputProps={{ maxLength: 8 }}
                  helperText="Shown next to your office name"
                  sx={{ width: 180 }} />
                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1 }}>
                  {EMOJI_SUGGESTIONS.map((e) => (
                    <Box key={e} onClick={() => setEmoji(e)}
                      sx={{
                        fontSize: 18, cursor: "pointer", p: 0.25, borderRadius: 1,
                        border: emoji === e ? "2px solid" : "2px solid transparent",
                        borderColor: emoji === e ? "primary.main" : undefined,
                        "&:hover": { bgcolor: "action.hover" },
                      }}>
                      {e}
                    </Box>
                  ))}
                </Stack>
              </Box>

              <Divider />

              {/* Name styling */}
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                  Room name style
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip title="Italic">
                    <IconButton size="small"
                      color={nameItalic ? "primary" : "default"}
                      onClick={() => setNameItalic(!nameItalic)}>
                      <FormatItalicIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Uppercase">
                    <IconButton size="small"
                      color={nameUppercase ? "primary" : "default"}
                      onClick={() => setNameUppercase(!nameUppercase)}>
                      <TextFieldsIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Box sx={{ ml: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.75 }}>
                      Name colour
                    </Typography>
                    <Swatch colors={ACCENT_PRESETS.slice(0, 8)} value={nameColor} onChange={setNameColor} />
                  </Box>
                </Stack>
              </Box>

              <Divider />

              {/* Motto */}
              <TextField label="Motto / tagline"
                placeholder="e.g. Building the future of storage"
                value={motto}
                onChange={(e) => setMotto(e.target.value.slice(0, 80))}
                size="small" fullWidth
                helperText={`${motto.length}/80 — italic text below your name`}
                inputProps={{ maxLength: 80 }} />

              <Divider />

              {/* Badge */}
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <TextField label="Status badge"
                  placeholder="e.g. Researching · DND · Coffee"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value.slice(0, 24))}
                  size="small" inputProps={{ maxLength: 24 }}
                  helperText="Short pill label" sx={{ flex: 1 }} />
                {badge && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                      Badge colour
                    </Typography>
                    <Swatch colors={ACCENT_PRESETS} value={badgeColor} onChange={setBadgeColor} />
                  </Box>
                )}
              </Stack>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* ── Pinned Links ─────────────────────────────────── */}
        <Accordion disableGutters elevation={0}
          sx={{ "&::before": { display: "none" } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle2">Pinned Links</Typography>
              <Chip label={`${links.length}/8`} size="small" sx={{ height: 18, fontSize: 11 }} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              <Typography variant="caption" color="text.secondary">
                Pin links to your Calendly, Zulip, GitHub, Zoom, Google Calendar, or any URL.
                They appear as clickable chips on your office card.
              </Typography>

              {/* Existing links */}
              {links.map((l) => (
                <Stack key={l.id} direction="row" alignItems="center" spacing={1}
                  sx={{
                    p: 1, borderRadius: 1,
                    border: "1px solid", borderColor: "divider", bgcolor: "action.hover",
                  }}>
                  <Typography sx={{ fontSize: 18, lineHeight: 1 }}>{LINK_ICON(l.url)}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{l.label}</Typography>
                    <Typography variant="caption" color="text.secondary"
                      sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.url}
                    </Typography>
                  </Box>
                  <IconButton size="small" color="error" onClick={() => removeLink(l.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}

              {/* Add new link */}
              {links.length < 8 && (
                <Box sx={{ pt: 1, borderTop: links.length ? "1px solid" : "none", borderColor: "divider" }}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        label="Label"
                        placeholder="e.g. My Calendly"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value.slice(0, 40))}
                        size="small"
                        sx={{ flex: 1 }}
                        inputProps={{ maxLength: 40 }}
                      />
                      <TextField
                        label="URL"
                        placeholder="https://calendly.com/..."
                        value={newUrl}
                        onChange={(e) => { setNewUrl(e.target.value); setUrlError(""); }}
                        size="small"
                        sx={{ flex: 2 }}
                        error={!!urlError}
                        helperText={urlError}
                        onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
                      />
                    </Stack>
                    {newUrl && (
                      <Typography variant="caption" color="text.secondary">
                        {LINK_ICON(newUrl)} Auto-detected icon
                      </Typography>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddLinkIcon />}
                      onClick={addLink}
                      disabled={!newLabel || !newUrl}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Add link
                    </Button>
                  </Stack>
                </Box>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* ── Channels (desks only) ────────────────────────── */}
        {isDesk && (
          <Accordion disableGutters elevation={0}
            sx={{ "&::before": { display: "none" }, borderTop: "1px solid", borderColor: "divider" }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle2">Channels</Typography>
                <Chip label={`${channels.length}`} size="small" sx={{ height: 18, fontSize: 11 }} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Link the Zulip channels for the projects you work on. They appear as chips on your desk.
              </Typography>
              <Stack sx={{ maxHeight: 260, overflowY: "auto" }}>
                {zulipChannels.map((ch) => (
                  <FormControlLabel
                    key={ch.id}
                    sx={{ m: 0 }}
                    control={
                      <Checkbox
                        size="small"
                        checked={channels.includes(ch.id)}
                        onChange={(e) =>
                          setChannels(
                            e.target.checked
                              ? [...channels, ch.id]
                              : channels.filter((x) => x !== ch.id),
                          )
                        }
                      />
                    }
                    label={<Typography variant="body2">#{ch.name}</Typography>}
                  />
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: "1px solid", borderColor: "divider" }}>
        <Button size="small" color="error" onClick={reset} disabled={saving}>
          Reset to default
        </Button>
        <Box sx={{ flex: 1 }} />
        {saveError && (
          <Typography color="error" variant="caption" sx={{ mr: 1 }}>{saveError}</Typography>
        )}
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
