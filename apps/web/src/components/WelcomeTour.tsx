import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Box, Button, Fade, Paper, Popper, Stack, Typography } from "@mui/material";
import type { PopperPlacementType } from "@mui/material";
import { useStore } from "../store";

// First-run guided tour. Lightweight custom coachmarks anchored to real DOM
// targets via `data-tour="..."` selectors — no extra dependency. The tour
// overlays a dimmed backdrop with a cut-out highlight around the current
// target and a floating card with Back / Next / Skip + a step counter.

const SEEN_KEY = "atrium.welcomeTourSeen.v1";

interface TourStep {
  /** CSS selector for the anchor element; null => centered, no anchor. */
  selector: string | null;
  title: string;
  body: string;
  placement: PopperPlacementType;
}

const STEPS: TourStep[] = [
  {
    selector: null,
    title: "Welcome to Atrium",
    body: "Your lab's new home base. Here's the quick tour — it takes about thirty seconds.",
    placement: "bottom",
  },
  {
    // Centered (not anchored to the office grid): the grid spans the whole
    // viewport, which pushed the Popper off-screen and made the tour look broken.
    selector: null,
    title: "This is your space",
    body: "The office floor below is yours — find your desk, drop into a room, and see who's around.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="chat-button"]',
    title: "Chat with the lab",
    body: "Chat lives here — the global room and your direct messages are one tap away.",
    placement: "bottom-end",
  },
  {
    selector: '[data-tour="user-menu"]',
    title: "Settings & your profile",
    body: "Settings and your profile live here. Theme, notifications, and the tour again anytime.",
    placement: "bottom-end",
  },
  {
    selector: '[data-tour="zulip-tab"]',
    title: "Connect your Zulip",
    body: "Connect your Zulip account here to bring your channels in.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="digest-tab"]',
    title: "Your daily digest",
    body: "Your daily digest lands here — a tidy recap of what the lab got up to.",
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

/**
 * Resolve the current step's anchor, skipping forward/back over any steps whose
 * target element isn't present. Returns the resolved index and its element (or
 * null for centered steps). Returns -1 if no resolvable step remains.
 */
function resolveStep(index: number, dir: 1 | -1): { index: number; el: HTMLElement | null } {
  let i = index;
  while (i >= 0 && i < STEPS.length) {
    const step = STEPS[i]!;
    if (step.selector === null) return { index: i, el: null };
    const el = document.querySelector<HTMLElement>(step.selector);
    if (el && el.offsetParent !== null) return { index: i, el };
    i += dir;
  }
  return { index: -1, el: null };
}

export function WelcomeTour() {
  const user = useStore((s) => s.user);
  const open = useStore((s) => s.welcomeTourOpen);
  const setOpen = useStore((s) => s.setWelcomeTourOpen);

  const [stepIndex, setStepIndex] = useState(0);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

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
      const { index } = resolveStep(0, 1);
      setStepIndex(index < 0 ? 0 : index);
    }
  }, [open]);

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
  useLayoutEffect(() => {
    if (!open) return;
    const step = STEPS[stepIndex];
    if (!step) return;
    const el = step.selector
      ? document.querySelector<HTMLElement>(step.selector)
      : null;
    measure(el);
    if (!el) return;
    const onMove = () => measure(el);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, stepIndex, measure]);

  const finish = useCallback(() => {
    markWelcomeTourSeen();
    setOpen(false);
  }, [setOpen]);

  const go = useCallback(
    (dir: 1 | -1) => {
      const { index } = resolveStep(stepIndex + dir, dir);
      if (index < 0) {
        finish();
        return;
      }
      setStepIndex(index);
    },
    [stepIndex, finish],
  );

  if (!open || !user) return null;
  const step = STEPS[stepIndex];
  if (!step) return null;

  // Human-facing position among the resolvable steps (so skipped/missing steps
  // don't leave gaps like "3 of 6" with a 4 that never shows).
  const isLast = resolveStep(stepIndex + 1, 1).index < 0;

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
      {/* Dimmed backdrop. Clicking it skips the tour. A cut-out ring sits over
          the current target so it stays legible. */}
      <Box
        onClick={finish}
        sx={{
          position: "absolute",
          inset: 0,
          bgcolor: "rgba(0,0,0,0.5)",
          pointerEvents: "auto",
          ...(highlight && {
            // Punch a hole around the target using a large spread shadow on a
            // transparent ring element; here we just dim everything and draw a
            // highlight box separately below.
          }),
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
            // itself stays clear — a clean coachmark cut-out with no overlay math.
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
            border: (t) => `2px solid ${t.palette.primary.main}`,
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
                  index={stepIndex}
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
            index={stepIndex}
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
  index: number;
  isLast: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

function TourCard({ step, index, isLast, onBack, onNext, onSkip }: TourCardProps) {
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
          {index + 1} of {STEPS.length}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" color="inherit" onClick={onSkip}>
          Skip
        </Button>
        {index > 0 && (
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
