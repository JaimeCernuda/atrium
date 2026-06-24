import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Box, Button, Fade, Paper, Popper, Stack, Typography } from "@mui/material";
import type { PopperPlacementType } from "@mui/material";
import { useStore } from "../store";

// First-run guided tour. Lightweight custom coachmarks anchored to real DOM
// targets via `data-tour="..."` selectors, no extra dependency. The tour
// overlays a dimmed backdrop with a cut-out highlight around the current
// target and a floating card with Back, Next, Skip, and a step counter.
//
// The tour never cancels itself when you click the backdrop or the highlighted
// element. It closes only via the explicit Skip and Done buttons.

const SEEN_KEY = "atrium.welcomeTourSeen.v1";

interface TourStep {
  /**
   * CSS selector(s) for the anchor element, tried in order. The first that
   * resolves wins. Use null for a centered step with no anchor.
   */
  selectors: string[] | null;
  title: string;
  body: string;
  placement: PopperPlacementType;
  /**
   * When true, the avatar/user menu is opened (via the store) before the step
   * shows, so the tour can anchor to one of the menu's items. The menu is
   * closed again when the tour leaves the menu run.
   */
  requiresMenu?: boolean;
}

const STEPS: TourStep[] = [
  {
    selectors: null,
    title: "Welcome to Atrium",
    body: "This is your lab's home base. Here is a quick tour of how to find your desk, drop into rooms, and reach your people. It takes about a minute.",
    placement: "bottom",
  },
  {
    // The user's own desk or office. Falls back to the whole office area only if
    // they don't own a room (so a new member still gets a sensible anchor).
    selectors: ["[data-tour-own-room]", '[data-tour="office"]'],
    title: "This is your space",
    body: "This card is yours. It is your desk on the floor, where people can find you and drop you a line.",
    placement: "bottom",
  },
  {
    selectors: ['[data-tour="enter-room"]', '[data-tour="room-card"]'],
    title: "Step into a room",
    body: "Tap the door on any room to walk in. Once you are inside, everyone there can see you and chat.",
    placement: "bottom",
  },
  {
    selectors: ['[data-tour="presence-avatar"]'],
    title: "Say hi to someone",
    body: "Click a person's face to open their menu. From there you can send a direct message, give them a ping, or peek at their work.",
    placement: "bottom",
  },
  {
    selectors: ['[data-tour="meeting-button"]'],
    title: "Hop into a meeting",
    body: "When a room has a video link, this button opens it. Your face lights up as in a meeting so the lab knows you are live.",
    placement: "bottom",
  },
  {
    selectors: ['[data-tour="desk-customize"]'],
    title: "Make your desk yours",
    body: "Decorate your space with a color, an emoji, a motto, and pinned links. There are controls nearby to rename it and wire up your channels too.",
    placement: "bottom",
  },
  {
    // The avatar/user menu button. The store-driven menu opens for this run.
    selectors: ['[data-tour="user-menu"]'],
    title: "Your profile and settings",
    body: "Everything about you lives in this menu. Let's open it and walk through what is inside.",
    placement: "bottom-end",
    requiresMenu: true,
  },
  {
    selectors: ['[data-tour="menu-profile"]'],
    title: "Edit your profile",
    body: "Set your display name and upload a photo so people recognize you on the floor.",
    placement: "left",
    requiresMenu: true,
  },
  {
    selectors: ['[data-tour="menu-theme"]'],
    title: "Pick your look",
    body: "Switch between light, dark, and system themes here. The app follows along right away.",
    placement: "left",
    requiresMenu: true,
  },
  {
    selectors: ['[data-tour="menu-notifications"]'],
    title: "Stay in the loop",
    body: "Flip on browser notifications so you hear about pings, knocks, and messages even when this tab is in the background.",
    placement: "left",
    requiresMenu: true,
  },
  {
    selectors: ['[data-tour="menu-connect-zulip"]'],
    title: "Connect your Zulip",
    body: "Sign in to Zulip once to pull your channels and direct messages into Atrium. This is the login that ties it all together.",
    placement: "left",
    requiresMenu: true,
  },
  {
    selectors: ['[data-tour="menu-submissions"]'],
    title: "Your submissions",
    body: "Made a submission to the lab? You can find and review all of yours from here.",
    placement: "left",
    requiresMenu: true,
  },
  {
    selectors: ['[data-tour="zulip-tab"]'],
    title: "The Zulip tab",
    body: "Once Zulip is connected, this tab is your full chat. Channels, topics, and people, all in one place.",
    placement: "bottom",
  },
  {
    selectors: ['[data-tour="digest-tab"]'],
    title: "Your daily digest",
    body: "This is a tidy recap of what the lab got up to. A good first stop each morning.",
    placement: "bottom",
  },
];

const PADDING = 8; // breathing room around the highlighted target

export function markWelcomeTourSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasSeenWelcomeTour(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // if storage is unavailable, don't nag
  }
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** First selector that resolves to a visible element, or null. */
function findEl(selectors: string[] | null): HTMLElement | null {
  if (!selectors) return null;
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.offsetParent !== null) return el;
  }
  return null;
}

/** Whether a step can be shown right now (centered steps always can). */
function stepResolvable(step: TourStep): boolean {
  if (step.selectors === null) return true;
  // Menu steps can't be checked until the menu is open; trust them to resolve.
  if (step.requiresMenu) return true;
  return findEl(step.selectors) !== null;
}

/**
 * Resolve the current step, skipping forward/back over any non-menu step whose
 * target isn't present. Returns -1 if no resolvable step remains in `dir`.
 */
function resolveStep(index: number, dir: 1 | -1): number {
  let i = index;
  while (i >= 0 && i < STEPS.length) {
    if (stepResolvable(STEPS[i]!)) return i;
    i += dir;
  }
  return -1;
}

/** Count of steps that will actually show, for an honest N-of-total counter. */
function resolvableCount(): number {
  return STEPS.filter(stepResolvable).length;
}

/** Human position (1-based) of `index` among the resolvable steps. */
function resolvablePosition(index: number): number {
  let n = 0;
  for (let i = 0; i <= index && i < STEPS.length; i++) {
    if (stepResolvable(STEPS[i]!)) n++;
  }
  return n;
}

export function WelcomeTour() {
  const user = useStore((s) => s.user);
  const open = useStore((s) => s.welcomeTourOpen);
  const setOpen = useStore((s) => s.setWelcomeTourOpen);
  const setUserMenuOpen = useStore((s) => s.setUserMenuOpen);

  const [stepIndex, setStepIndex] = useState(0);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = open ? STEPS[stepIndex] : undefined;

  // Auto-start once for an authed user who hasn't seen it. A small delay lets
  // the office render so the anchors exist.
  useEffect(() => {
    if (!user) return;
    if (hasSeenWelcomeTour()) return;
    const t = window.setTimeout(() => {
      if (!hasSeenWelcomeTour()) {
        setStepIndex(0);
        useStore.getState().setWelcomeTourOpen(true);
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [user]);

  // When (re)opened, reset to the first resolvable step.
  useEffect(() => {
    if (open) {
      const idx = resolveStep(0, 1);
      setStepIndex(idx < 0 ? 0 : idx);
    }
  }, [open]);

  // Open or close the avatar menu so the menu steps can anchor to its items.
  // The menu is open only while a `requiresMenu` step is current.
  useEffect(() => {
    if (!open) {
      setUserMenuOpen(false);
      return;
    }
    setUserMenuOpen(!!step?.requiresMenu);
  }, [open, step?.requiresMenu, setUserMenuOpen]);

  const measure = useCallback((el: HTMLElement | null) => {
    setAnchorEl(el);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  // Resolve & measure the current step's anchor; keep it fresh on resize/scroll.
  // Menu steps get a short retry so the menu has time to mount before we anchor.
  useLayoutEffect(() => {
    if (!open || !step) return;
    let raf = 0;
    const tryMeasure = () => {
      const el = findEl(step.selectors);
      measure(el);
      return el;
    };
    let el = tryMeasure();
    // The menu paints a frame or two after we flip the store flag; retry briefly.
    if (!el && step.requiresMenu) {
      let tries = 0;
      const tick = () => {
        el = tryMeasure();
        if (!el && tries++ < 30) raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    }
    const onMove = () => measure(findEl(step.selectors));
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, step, stepIndex, measure]);

  const finish = useCallback(() => {
    markWelcomeTourSeen();
    setUserMenuOpen(false);
    setOpen(false);
  }, [setOpen, setUserMenuOpen]);

  const go = useCallback(
    (dir: 1 | -1) => {
      const idx = resolveStep(stepIndex + dir, dir);
      if (idx < 0) {
        finish();
        return;
      }
      setStepIndex(idx);
    },
    [stepIndex, finish],
  );

  if (!open || !user || !step) return null;

  // Honest counter: position and total among steps that will actually show.
  const position = resolvablePosition(stepIndex);
  const total = resolvableCount();
  const isLast = resolveStep(stepIndex + 1, 1) < 0;

  const highlight: Rect | null = rect
    ? {
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: (t) => t.zIndex.modal + 2,
        pointerEvents: "none",
      }}
    >
      {/* Dimmed backdrop. It captures stray clicks (so nothing behind it fires
          by accident) but does NOT cancel the tour. The tour only closes via the
          Skip and Done buttons on the card. */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          bgcolor: "rgba(0,0,0,0.5)",
          pointerEvents: "auto",
        }}
      />

      {highlight && (
        <Box
          sx={{
            position: "absolute",
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            borderRadius: 1.5,
            // The big spread shadow dims the rest of the screen while the box
            // itself stays clear, a clean coachmark cut-out with no overlay math.
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
            border: (t) => `2px solid ${t.palette.primary.main}`,
            // Never swallow clicks; let the highlighted control stay usable and
            // never let a click here close the tour.
            pointerEvents: "none",
            transition: "all 180ms ease",
          }}
        />
      )}

      {anchorEl ? (
        <Popper
          open
          anchorEl={anchorEl}
          placement={step.placement}
          transition
          modifiers={[
            { name: "offset", options: { offset: [0, 14] } },
            { name: "preventOverflow", options: { padding: 8 } },
            { name: "flip", options: { padding: 8 } },
          ]}
          sx={{ zIndex: (t) => t.zIndex.modal + 3 }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={180}>
              <Box sx={{ pointerEvents: "auto" }}>
                <TourCard
                  step={step}
                  position={position}
                  total={total}
                  isLast={isLast}
                  onBack={() => go(-1)}
                  onNext={() => go(1)}
                  onSkip={finish}
                />
              </Box>
            </Fade>
          )}
        </Popper>
      ) : (
        // Centered card for steps with no anchor (the welcome step).
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "auto",
            px: 2,
            width: "100%",
            maxWidth: 360,
          }}
        >
          <TourCard
            step={step}
            position={position}
            total={total}
            isLast={isLast}
            onBack={() => go(-1)}
            onNext={() => go(1)}
            onSkip={finish}
          />
        </Box>
      )}
    </Box>
  );
}

interface TourCardProps {
  step: TourStep;
  position: number;
  total: number;
  isLast: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

function TourCard({ step, position, total, isLast, onBack, onNext, onSkip }: TourCardProps) {
  return (
    <Paper
      elevation={8}
      sx={{
        p: 2,
        width: { xs: "calc(100vw - 32px)", sm: 320 },
        maxWidth: 360,
        borderRadius: 2,
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {step.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {step.body}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="caption" color="text.secondary">
          {position} of {total}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" color="inherit" onClick={onSkip}>
          Skip
        </Button>
        {position > 1 && (
          <Button size="small" onClick={onBack}>
            Back
          </Button>
        )}
        <Button size="small" variant="contained" onClick={onNext}>
          {isLast ? "Done" : "Next"}
        </Button>
      </Stack>
    </Paper>
  );
}
