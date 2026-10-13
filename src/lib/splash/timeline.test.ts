import { describe, expect, it } from "vitest";
import {
  HANDOFF_MS,
  INTRO_EASE,
  LATE_SCRIPT_MS,
  PULSE_MS,
  SPLASH_DONE_LIMIT_MS,
  heroReveal,
  planSplash,
} from "./timeline";

const READY_TIMES = [0, 100, 350, 600, 900, 1200, 1500, 1800, 2000, 2001, 2300, 2800, 2801, 3000, 5000];

describe("planSplash", () => {
  it.each(READY_TIMES)("keeps the marks in order when the script is ready at %i ms", (jsReady) => {
    const plan = planSplash(jsReady);
    expect(plan.embersStart).toBeLessThanOrEqual(plan.pulseAt);
    expect(plan.pulseAt).toBeLessThanOrEqual(plan.handoffAt);
    expect(plan.handoffAt).toBeLessThan(plan.doneAt);
  });

  it.each(READY_TIMES)("takes exactly the hand-off length between hand-off and done, ready at %i ms", (jsReady) => {
    const plan = planSplash(jsReady);
    expect(plan.doneAt - plan.handoffAt).toBe(HANDOFF_MS);
  });

  it("hands off at 1800 ms when the script arrives early, so the shell has time to mean something", () => {
    for (const jsReady of [0, 100, 350, 600]) {
      const plan = planSplash(jsReady);
      expect(plan.handoffAt, String(jsReady)).toBe(1800);
      expect(plan.pulseAt, String(jsReady)).toBe(1800 - PULSE_MS);
      expect(plan.skipEmbers, String(jsReady)).toBe(false);
    }
  });

  it("starts the embers once the script is ready, but never before 350 ms", () => {
    expect(planSplash(0).embersStart).toBe(350);
    expect(planSplash(200).embersStart).toBe(350);
    expect(planSplash(600).embersStart).toBe(600);
    expect(planSplash(1200).embersStart).toBe(1200);
  });

  it("gives the embers 900 ms before the pulse when the script is late but not too late", () => {
    for (const jsReady of [700, 1200, 1600]) {
      const plan = planSplash(jsReady);
      expect(plan.skipEmbers, String(jsReady)).toBe(false);
      expect(plan.pulseAt, String(jsReady)).toBe(jsReady + 900);
      expect(plan.handoffAt, String(jsReady)).toBe(jsReady + 900 + PULSE_MS);
    }
  });

  it("shortens the gathering rather than the dissolve when a late script would run past the limit", () => {
    const plan = planSplash(2000);
    expect(plan.skipEmbers).toBe(false);
    expect(plan.handoffAt).toBe(SPLASH_DONE_LIMIT_MS - HANDOFF_MS);
    expect(plan.pulseAt).toBe(plan.handoffAt - PULSE_MS);
    expect(plan.embersStart).toBe(2000);
    expect(plan.doneAt).toBe(SPLASH_DONE_LIMIT_MS);
  });

  it("skips the embers, and hands off at once, exactly when the script is later than the limit", () => {
    expect(planSplash(LATE_SCRIPT_MS).skipEmbers).toBe(false);
    expect(planSplash(LATE_SCRIPT_MS + 1).skipEmbers).toBe(true);
    for (const jsReady of [2001, 2300, 2800]) {
      const plan = planSplash(jsReady);
      expect(plan.skipEmbers, String(jsReady)).toBe(true);
      expect(plan.handoffAt, String(jsReady)).toBe(jsReady);
      expect(plan.pulseAt, String(jsReady)).toBe(jsReady);
      expect(plan.embersStart, String(jsReady)).toBe(jsReady);
    }
  });

  it("never lets the shell outlive the done limit, however late the script", () => {
    for (let jsReady = 0; jsReady <= 5000; jsReady += 1) {
      const plan = planSplash(jsReady);
      expect(plan.doneAt, String(jsReady)).toBeLessThanOrEqual(SPLASH_DONE_LIMIT_MS);
      expect(plan.handoffAt, String(jsReady)).toBeLessThanOrEqual(SPLASH_DONE_LIMIT_MS - HANDOFF_MS);
    }
    expect(planSplash(5000).handoffAt).toBe(SPLASH_DONE_LIMIT_MS - HANDOFF_MS);
  });

  it("treats a time it cannot read as the script being ready at once", () => {
    expect(planSplash(Number.NaN)).toEqual(planSplash(0));
    expect(planSplash(-50)).toEqual(planSplash(0));
    expect(planSplash(Number.POSITIVE_INFINITY).doneAt).toBeLessThanOrEqual(SPLASH_DONE_LIMIT_MS);
  });
});

describe("heroReveal", () => {
  it("rises and fades with the shared ease, after the delay asked for", () => {
    const variants = heroReveal(false, 0.25);
    expect(variants.hidden).toEqual({ opacity: 0, y: 12 });
    expect(variants.show).toEqual({ opacity: 1, y: 0, transition: { duration: 0.7, ease: [...INTRO_EASE], delay: 0.25 } });
    expect(heroReveal(false).show).toMatchObject({ transition: { delay: 0 } });
  });

  it("only fades, with no movement and no delay, for someone who asked for less motion", () => {
    const variants = heroReveal(true, 0.25);
    expect(variants.hidden).toEqual({ opacity: 0 });
    expect(variants.show).toEqual({ opacity: 1, transition: { duration: 0.4 } });
    expect(JSON.stringify(variants)).not.toContain('"y"');
    expect(JSON.stringify(variants)).not.toContain("delay");
  });
});
