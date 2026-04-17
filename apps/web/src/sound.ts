/**
 * Short tones generated via Web Audio API. No asset files.
 *
 * Browsers require a user gesture before playing. We lazy-create the context
 * on first call — typically happens *after* the user enables notifications
 * or sends a message, both of which are gestures.
 */

type AudioCtx = AudioContext;

let ctx: AudioCtx | null = null;

function getCtx(): AudioCtx | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function tone(freq: number, duration: number, offset = 0, volume = 0.18): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => undefined);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const start = c.currentTime + offset;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const sounds = {
  // Soft two-note chime for DMs/ping/knock
  chime: (): void => {
    tone(523.25, 0.2, 0);
    tone(783.99, 0.25, 0.1);
  },
  // Firmer two-note pulse for knock — wants attention
  knock: (): void => {
    tone(392, 0.12, 0, 0.22);
    tone(392, 0.12, 0.18, 0.22);
    tone(587.33, 0.2, 0.36, 0.22);
  },
  // Soft click for global chat
  tap: (): void => {
    tone(880, 0.08, 0, 0.1);
  },
};
