"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { SPLASH_ATTRIBUTE, SPLASH_DONE_EVENT, SPLASH_HANDOFF_EVENT, type SplashPhase } from "../boot";

/** What the attribute on <html> says right now. Absent means nothing is showing. */
export function readSplashPhase(): SplashPhase {
  const value = document.documentElement.getAttribute(SPLASH_ATTRIBUTE);
  return value === "pending" || value === "handoff" ? value : "done";
}

export interface SplashState {
  phase: SplashPhase;
  reducedMotion: boolean;
}

/**
 * Where the opening splash is, for anything that should wait for it: the
 * hero's reveals start at the hand-off, heavy background effects once it is
 * done. Until the first effect runs the answer is "pending", so nothing
 * reveals under the mask; a page reached by a single-page navigation has no
 * attribute and is told "done" on that first effect.
 */
export function useSplashPhase(): SplashState {
  const [phase, setPhase] = useState<SplashPhase>("pending");
  const reducedMotion = useReducedMotion() === true;

  useEffect(() => {
    const update = () => setPhase(readSplashPhase());
    update();
    // The attribute is the source of truth, whoever changes it: the
    // controller, or the boot script's backstop, which sends no event.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [SPLASH_ATTRIBUTE] });
    window.addEventListener(SPLASH_HANDOFF_EVENT, update);
    window.addEventListener(SPLASH_DONE_EVENT, update);
    return () => {
      observer.disconnect();
      window.removeEventListener(SPLASH_HANDOFF_EVENT, update);
      window.removeEventListener(SPLASH_DONE_EVENT, update);
    };
  }, []);

  return { phase, reducedMotion };
}
