"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import phoenix from "@/assets/logos/sep_logos/sep_white.png";
import ember from "@/assets/logos/ember.png";
import {
  SPLASH_ATTRIBUTE,
  SPLASH_DONE_EVENT,
  SPLASH_HANDOFF_EVENT,
  SPLASH_SEEN_KEY,
} from "@/lib/splash/boot";
import { createEmberField, type EmberField } from "@/lib/splash/client/embers";
import { HANDOFF_MS, planSplash } from "@/lib/splash/timeline";

/** The hero marks its logo with this, so the splash logo can settle onto it. */
const HERO_LOGO = "[data-hero-logo]";
/** The ring starts at this diameter (see .splash-ring) and grows to fill the view. */
const RING_PX = 180;

/**
 * The opening of the public site. The shell is in the server's HTML and is
 * shown by the boot script's attribute alone, so the logo is in the first
 * paint and eases in from CSS before any script has run. The controller then
 * gathers the embers, pulses once, and dissolves into the hero. Whatever goes
 * wrong, release() lifts everything, and the boot script's backstop lifts
 * the attribute on its own if even that never runs.
 */
export default function SplashScreen() {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  // The canvas alone is unmounted when the splash is over; the shell stays,
  // hidden by the stylesheet, so the markup never differs from the server's.
  const [active, setActive] = useState(true);

  useEffect(() => {
    const html = document.documentElement;
    // A single-page navigation, a skipped splash, or a backstop that already fired.
    if (html.getAttribute(SPLASH_ATTRIBUTE) !== "pending") return;
    const shell = shellRef.current;
    const canvas = canvasRef.current;
    const logo = logoRef.current;
    const ring = ringRef.current;
    if (!shell || !canvas || !logo || !ring) return;

    let released = false;
    let embers: EmberField | null = null;
    let kill: (() => void) | null = null;
    const alive = () => !released && html.hasAttribute(SPLASH_ATTRIBUTE);

    const release = () => {
      if (released) return;
      released = true;
      kill?.();
      embers?.dispose();
      // Lag smoothing is a global GSAP setting; put the default back for anything after us.
      void import("gsap").then(({ gsap }) => gsap.ticker.lagSmoothing(500, 33)).catch(() => undefined);
      try {
        sessionStorage.setItem(SPLASH_SEEN_KEY, "true");
      } catch {
        // Storage can be blocked. The attribute is what matters.
      }
      html.removeAttribute(SPLASH_ATTRIBUTE);
      window.dispatchEvent(new Event(SPLASH_DONE_EVENT));
      setActive(false);
    };

    // If the backstop lifts the attribute first, finish up at once.
    const observer = new MutationObserver(() => {
      if (!html.hasAttribute(SPLASH_ATTRIBUTE)) release();
    });
    observer.observe(html, { attributes: true, attributeFilter: [SPLASH_ATTRIBUTE] });

    (async () => {
      try {
        const plan = planSplash(performance.now());
        const { gsap } = await import("gsap");
        if (!alive()) return;
        // The marks are moments on the real clock. GSAP's lag smoothing would
        // quietly push them later after a long frame, past the backstop; the
        // timeline follows the clock instead and catches up after a stall.
        gsap.ticker.lagSmoothing(0);
        // Marks are absolute; the timeline starts now, so each is a delay from here.
        const built = performance.now();
        const at = (mark: number): number => Math.max(0, mark - built) / 1000;
        const timeline = gsap.timeline();
        kill = () => timeline.kill();

        if (!plan.skipEmbers) {
          embers = createEmberField(canvas, shell, ember.src);
          const field = embers;
          timeline.call(() => { if (alive()) field.start(); }, [], at(plan.embersStart));
          timeline.to(
            shell,
            { "--splash-glow": 0.7, duration: Math.max(0.3, (plan.pulseAt - plan.embersStart) / 1000), ease: "power1.inOut" },
            at(plan.embersStart),
          );
          // The pulse: one ring outward, a breath from the logo, and the embers let go.
          const ringScale = (2.2 * Math.min(window.innerWidth, window.innerHeight)) / RING_PX;
          timeline.call(() => {
            if (!alive()) return;
            logo.style.animation = "none";
            field.release();
          }, [], at(plan.pulseAt));
          timeline.fromTo(
            ring,
            { scale: 1, opacity: 0.6 },
            { scale: ringScale, opacity: 0, duration: 0.6, ease: "power2.out" },
            at(plan.pulseAt),
          );
          timeline.to(logo, { scale: 1.04, duration: 0.15, ease: "sine.inOut", yoyo: true, repeat: 1 }, at(plan.pulseAt));
        }

        // The hand-off: the mask lifts, the hero is already underneath, and
        // the shell dissolves while the logo settles onto the hero's.
        timeline.call(() => {
          if (!alive()) return;
          html.setAttribute(SPLASH_ATTRIBUTE, "handoff");
          window.dispatchEvent(new Event(SPLASH_HANDOFF_EVENT));
          logo.style.animation = "none";
          gsap.to(shell, { opacity: 0, duration: HANDOFF_MS / 1000, ease: "power2.inOut" });
          const target = document.querySelector<HTMLElement>(HERO_LOGO);
          const from = logo.getBoundingClientRect();
          const to = target?.getBoundingClientRect();
          if (to && to.width > 0 && from.width > 0) {
            gsap.to(logo, {
              x: to.left + to.width / 2 - (from.left + from.width / 2),
              y: to.top + to.height / 2 - (from.top + from.height / 2),
              scale: to.width / from.width,
              duration: HANDOFF_MS / 1000,
              ease: "power3.inOut",
            });
          } else {
            gsap.to(logo, { opacity: 0, duration: 0.4, ease: "power2.inOut" });
          }
        }, [], at(plan.handoffAt));
        timeline.call(release, [], at(plan.doneAt));
      } catch {
        release();
      }
    })();

    // Unmounting only stops the work. The attribute is left to the controller
    // or the backstop, so a development remount (StrictMode) does not skip
    // the opening by lifting it early.
    return () => {
      observer.disconnect();
      kill?.();
      embers?.dispose();
    };
  }, []);

  return (
    <div ref={shellRef} data-splash-screen="" aria-hidden="true">
      <div className="splash-glow" />
      {active ? <canvas ref={canvasRef} className="splash-canvas" /> : null}
      <div ref={ringRef} className="splash-ring" />
      <Image
        ref={logoRef}
        src={phoenix}
        alt=""
        priority
        width={210}
        height={210}
        className="splash-logo"
        draggable={false}
      />
    </div>
  );
}
