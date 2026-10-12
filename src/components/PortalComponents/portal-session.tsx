"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  apiFetch,
  endsSession,
  errorMessage,
  onSessionEnded,
} from "@/lib/portal/client/api";
import { getPortalAuth } from "@/lib/portal/client/firebase";
import { TIMING } from "@/lib/portal/constants";
import { parseIso } from "@/lib/portal/dates";
import { areaAllows, ROLE_HOME } from "@/lib/portal/roles";
import type { MeDto, MemberRole } from "@/lib/portal/types";

type SignOutReason = "signed_out" | "idle" | "ended";

interface PortalSession {
  me: MeDto;
  signOut: (reason?: SignOutReason) => Promise<void>;
  /** The current time by the server's clock, so a wrong device clock cannot mislead anyone about a deadline. */
  now: () => number;
  /** Records that the welcome tour is finished, which opens the rest of the portal. */
  completeOnboarding: () => Promise<void>;
}

/** Where each kind of member is taken on a first visit. Admins have no welcome. */
export const WELCOME_PATH: Record<MemberRole, string> = {
  pledge: "/portal/welcome",
  active: "/portal/review/welcome",
};

// When this tab last saw any input, kept across reloads. A tab that is closed
// and later reopened by someone else comes back with its sign-in restored, and
// this is what lets it be signed out if it has been idle too long.
const LAST_ACTIVE_KEY = "sep-portal-last-active";

interface ActiveMark {
  signedInAt: string;
  at: number;
}

function readActiveMark(): ActiveMark | null {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(LAST_ACTIVE_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return null;
    const { signedInAt, at } = parsed as Record<string, unknown>;
    return typeof signedInAt === "string" && typeof at === "number" ? { signedInAt, at } : null;
  } catch {
    return null;
  }
}

function writeActiveMark(mark: ActiveMark | null): void {
  try {
    if (mark) window.sessionStorage.setItem(LAST_ACTIVE_KEY, JSON.stringify(mark));
    else window.sessionStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    // Storage can be unavailable in private windows. The in-memory idle timer still applies.
  }
}

const SessionContext = createContext<PortalSession | null>(null);

export function usePortal(): PortalSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error("usePortal must be used inside the portal layout.");
  return session;
}

/** Server time that refreshes on an interval, for "due in 2 hours" style labels. */
export function useServerNow(refreshMs = 30_000): number {
  const { now } = usePortal();
  const [value, setValue] = useState(now);
  useEffect(() => {
    const timer = window.setInterval(() => setValue(now()), refreshMs);
    return () => window.clearInterval(timer);
  }, [now, refreshMs]);
  return value;
}

const DELIVERABLE_PATH = /^\/portal\/deliverables\/([A-Za-z0-9]{1,64})$/;

const FullScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center font-normal text-muted-foreground">
    {children}
  </div>
);

/**
 * Guards every portal page. Nothing inside renders until the server has
 * confirmed the sign-in, and the browser is sent back to the sign-in page the
 * moment the server stops accepting it. This is a convenience for honest users:
 * the real protection is that the API refuses every request it cannot verify.
 */
const PortalSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname() ?? "/portal";
  const [me, setMe] = useState<MeDto | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const clockOffset = useRef(0);
  const leaving = useRef(false);
  const signedInAt = useRef("");
  const pledge = useRef(false);
  pledge.current = me?.role === "pledge";
  const currentPath = useRef(pathname);
  currentPath.current = pathname;

  const signOut = useCallback(
    async (reason: SignOutReason = "signed_out") => {
      if (leaving.current) return;
      leaving.current = true;
      writeActiveMark(null);
      let notice: string = reason;
      if (reason !== "ended") {
        const quietly = { method: "POST", keepalive: true } as const;
        // Choosing "Sign out" ends the sign-in on the server, so it stops
        // working everywhere, and credits the last stretch of the visit in the
        // same request. An idle timeout only clears this tab, because the same
        // person may be in the middle of something in another one; it just
        // credits the time.
        const farewell: Promise<boolean> =
          reason === "signed_out"
            ? apiFetch("/sign-out", quietly).then(
                () => true,
                () => false,
              )
            : (pledge.current ? apiFetch("/heartbeat", quietly) : Promise.resolve()).then(
                () => true,
                () => true,
              );
        // A slow network must not leave someone looking signed in.
        const patience = new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 2500));
        const confirmed = await Promise.race([farewell, patience]);
        // If the server did not confirm in time, say so rather than imply
        // that every other tab and device has been signed out.
        if (reason === "signed_out" && !confirmed) notice = "signed_out_here";
      }
      const auth = getPortalAuth();
      if (auth) await firebaseSignOut(auth).catch(() => undefined);
      router.replace(`/login?notice=${notice}`);
    },
    [router],
  );

  const completeOnboarding = useCallback(async () => {
    const result = await apiFetch<{ onboardedAt: string }>("/onboarding", { method: "POST" });
    setMe((current) => (current ? { ...current, onboardedAt: result.onboardedAt } : current));
  }, []);

  useEffect(() => {
    const auth = getPortalAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    const stopListening = onSessionEnded((error) => {
      // Someone who has not chosen their own password yet does that on the sign-in page.
      if (error.code === "password_change_required") {
        router.replace(`/login?next=${encodeURIComponent(currentPath.current)}`);
      }
      else void signOut("ended");
    });
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (leaving.current) return;
      if (!user) {
        writeActiveMark(null);
        router.replace(`/login?next=${encodeURIComponent(currentPath.current)}`);
        return;
      }
      // The same sign-in coming back after too long without input is signed out
      // before anything is shown. A new sign-in starts its own clock.
      signedInAt.current = user.metadata.lastSignInTime ?? "";
      const mark = readActiveMark();
      const stale =
        mark !== null &&
        mark.signedInAt === signedInAt.current &&
        Date.now() - mark.at > TIMING.idleSignOutMs;
      if (stale) {
        void signOut("idle");
        return;
      }
      writeActiveMark({ signedInAt: signedInAt.current, at: Date.now() });
      apiFetch<MeDto>("/me")
        .then((profile) => {
          clockOffset.current = (parseIso(profile.serverNow) ?? Date.now()) - Date.now();
          setUnavailable(null);
          setMe(profile);
        })
        .catch((caught: unknown) => {
          if (caught instanceof ApiError && endsSession(caught)) return;
          // Refused outright, for example an admin taken off the list. There is
          // nothing to retry, so the way out is to sign out.
          if (caught instanceof ApiError && caught.status === 403) {
            void signOut("ended");
            return;
          }
          setUnavailable(errorMessage(caught));
        });
    });
    return () => {
      unsubscribe();
      stopListening();
    };
  }, [router, signOut]);

  // Each role has its own area. This only tidies the address; the API enforces it.
  const misplaced = me !== null && !areaAllows(me.role, pathname);

  useEffect(() => {
    if (!me || !misplaced) return;
    router.replace(ROLE_HOME[me.role]);
  }, [me, misplaced, router]);

  // A pledge's or an active's first visit starts with a short welcome. It is shown once.
  const welcomePath = me !== null && me.role !== "admin" ? WELCOME_PATH[me.role] : null;
  const needsWelcome =
    me !== null && welcomePath !== null && me.onboardedAt === null && pathname !== welcomePath;

  useEffect(() => {
    if (needsWelcome && welcomePath) router.replace(welcomePath);
  }, [needsWelcome, welcomePath, router]);

  // Time on the site: one beat a minute while this tab is actually being looked
  // at. Only pledges are timed; nothing is recorded about how admins use the portal.
  useEffect(() => {
    if (!me || me.role !== "pledge") return;
    let lastBeat = 0;
    const beat = (resume: boolean, closing = false) => {
      // The server ignores beats closer together than this, so they are not sent.
      if (leaving.current || Date.now() - lastBeat < TIMING.heartbeatMinIntervalMs) return;
      lastBeat = Date.now();
      const match = DELIVERABLE_PATH.exec(currentPath.current);
      void apiFetch("/heartbeat", {
        method: "POST",
        keepalive: closing,
        body: { resume, ...(match ? { formId: match[1] } : {}) },
      }).catch(() => undefined);
    };
    beat(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") beat(false);
    }, TIMING.heartbeatIntervalMs);
    // Coming back marks the pledge present without counting the time away.
    // Leaving counts the time up to that moment, in a request that survives
    // the tab closing.
    const onVisibility = () => {
      const visible = document.visibilityState === "visible";
      beat(visible, !visible);
    };
    const onPageHide = () => beat(false, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [me]);

  // Sign out after a stretch with no input, in case the tab was left open on a shared computer.
  useEffect(() => {
    if (!me) return;
    let lastInput = Date.now();
    let lastMarked = lastInput;
    const touch = () => {
      // Input after a long sleep is not activity: the time away was idle, and
      // this must not reset the clock before the timer below notices.
      if (Date.now() - lastInput > TIMING.idleSignOutMs) {
        void signOut("idle");
        return;
      }
      lastInput = Date.now();
      // Kept for the next load of this tab. Written sparingly, since this runs on every move.
      if (lastInput - lastMarked > 15_000) {
        lastMarked = lastInput;
        writeActiveMark({ signedInAt: signedInAt.current, at: lastInput });
      }
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - lastInput > TIMING.idleSignOutMs) void signOut("idle");
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, touch));
    };
  }, [me, signOut]);

  const session = useMemo<PortalSession | null>(
    () =>
      me
        ? { me, signOut, completeOnboarding, now: () => Date.now() + clockOffset.current }
        : null,
    [me, signOut, completeOnboarding],
  );

  if (unavailable) {
    return (
      <FullScreen>
        <p className="text-lg text-foreground">The portal isn&apos;t available right now</p>
        <p className="max-w-sm text-sm">{unavailable}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </FullScreen>
    );
  }

  if (!session || misplaced || needsWelcome) {
    return (
      <FullScreen>
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm" role="status">
          Opening the portal
        </span>
      </FullScreen>
    );
  }

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
};

export default PortalSessionProvider;
