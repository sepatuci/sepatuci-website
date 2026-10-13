import type { Variants } from "framer-motion";

/**
 * The splash's marks, in milliseconds since navigation start (the clock of
 * performance.now()). The shell paints at once from CSS alone; the embers and
 * the pulse need the script, so they wait for it, and the whole thing is
 * bounded so the backstop in the boot script never cuts it off mid-motion.
 */
export interface SplashPlan {
  /** When the embers begin to gather. */
  embersStart: number;
  /** When the ring pulses and the embers let go. */
  pulseAt: number;
  /** When the mask lifts and the shell starts to dissolve into the hero. */
  handoffAt: number;
  /** When the shell is gone. */
  doneAt: number;
  /** True when the script arrived too late for the embers to be worth it: the logo alone hands off. */
  skipEmbers: boolean;
}

/** How long the hand-off dissolve takes. */
export const HANDOFF_MS = 500;
/** How long the pulse lasts before the hand-off. */
export const PULSE_MS = 300;
/** The script arriving later than this plays the logo alone. */
export const LATE_SCRIPT_MS = 2000;
/** The latest the shell may still be there, comfortably inside the boot script's backstop. */
export const SPLASH_DONE_LIMIT_MS = 3300;

export function planSplash(jsReadyMs: number): SplashPlan {
  const jsReady = Number.isFinite(jsReadyMs) ? Math.max(0, jsReadyMs) : 0;
  const skipEmbers = jsReady > LATE_SCRIPT_MS;
  const handoffAt = Math.min(
    skipEmbers ? jsReady : Math.max(jsReady + 900, 1500) + PULSE_MS,
    SPLASH_DONE_LIMIT_MS - HANDOFF_MS,
  );
  const pulseAt = skipEmbers ? handoffAt : handoffAt - PULSE_MS;
  const embersStart = skipEmbers ? pulseAt : Math.min(Math.max(jsReady, 350), pulseAt);
  return { embersStart, pulseAt, handoffAt, doneAt: handoffAt + HANDOFF_MS, skipEmbers };
}

/** The ease the hero and the nav share with the splash. */
export const INTRO_EASE: readonly [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * How a piece of the hero appears once the splash hands off: a short rise and
 * fade. With reduced motion it only fades, with no delay.
 */
export function heroReveal(reducedMotion: boolean, delay = 0): Variants {
  if (reducedMotion) {
    return {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { duration: 0.4 } },
    };
  }
  return {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [...INTRO_EASE], delay } },
  };
}
