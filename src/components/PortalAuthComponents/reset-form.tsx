"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeAuthError, isDeadResetLink } from "@/lib/portal/auth-errors";
import { getPortalAuth } from "@/lib/portal/client/firebase";
import { PROGRAM_NAME } from "@/lib/portal/constants";
import { passwordProblem } from "@/lib/portal/password";
import { PasswordFields } from "./password-fields";
import SetupProgress from "./setup-progress";

type Stage =
  | { name: "verifying" }
  | { name: "form"; email: string }
  | { name: "done"; message: string }
  // spent: the link itself is used up or expired, so only a new one will do.
  | { name: "dead"; message: string; spent: boolean };

const DEAD_LINK = "This link is no longer valid. Links expire after about an hour and work once.";

/**
 * Email links this page does not handle itself, such as undoing an email
 * change. Firebase's own page does, on the project's own domain.
 */
const HANDED_OVER = new Set(["recoverEmail", "verifyAndChangeEmail", "revertSecondFactorAddition"]);

/**
 * Handles the links in Firebase's emails: setting a password for the first
 * time, replacing one when an admin sends a new link, and confirming an email address.
 */
const ResetForm: React.FC = () => {
  const params = useSearchParams();
  // The one-time code is read once and then removed from the address bar, so it
  // does not linger in browser history or get shared by accident.
  const code = useRef(params.get("oobCode") ?? "");
  const mode = useRef(params.get("mode") ?? "resetPassword");
  // Links for a brand-new account say so, and get a short introduction.
  const welcome = useRef(
    params.get("welcome") === "1" || (params.get("continueUrl") ?? "").includes("welcome=1"),
  );

  const [stage, setStage] = useState<Stage>({ name: "verifying" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.history.replaceState(null, "", "/login/reset");
    const auth = getPortalAuth();
    if (!auth || code.current.length === 0) {
      setStage({ name: "dead", message: DEAD_LINK, spent: true });
      return;
    }
    const authDomain = auth.config.authDomain;
    if (HANDED_OVER.has(mode.current) && authDomain) {
      // Only the link's type and one-time code are passed on, with this
      // project's own key. Nothing else from the address is forwarded.
      const handoff = new URLSearchParams({
        mode: mode.current,
        oobCode: code.current,
        apiKey: auth.config.apiKey,
      });
      window.location.replace(`https://${authDomain}/__/auth/action?${handoff.toString()}`);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        if (mode.current === "verifyEmail") {
          await applyActionCode(auth, code.current);
          if (!cancelled) setStage({ name: "done", message: "Your email address is confirmed." });
          return;
        }
        if (mode.current !== "resetPassword") {
          if (!cancelled) setStage({ name: "dead", message: DEAD_LINK, spent: true });
          return;
        }
        const email = await verifyPasswordResetCode(auth, code.current);
        if (!cancelled) setStage({ name: "form", email });
      } catch (caught) {
        if (!cancelled) {
          setStage({
            name: "dead",
            message: describeAuthError(caught, "reset"),
            spent: isDeadResetLink(caught),
          });
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const email = stage.name === "form" ? stage.email : "";
  const ready = passwordProblem(password, { email }) === null && confirm === password;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const auth = getPortalAuth();
    if (!auth || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordReset(auth, code.current, password);
      setStage({
        name: "done",
        message: welcome.current
          ? "Your password is set. Next, sign in with it to finish setting up."
          : "Your password is set. You can sign in now.",
      });
    } catch (caught) {
      if (isDeadResetLink(caught)) {
        setStage({ name: "dead", message: describeAuthError(caught, "reset"), spent: true });
      } else {
        setError(describeAuthError(caught, "reset"));
      }
    } finally {
      setBusy(false);
    }
  };

  if (stage.name === "verifying") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground" role="status">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Checking your link</span>
      </div>
    );
  }

  if (stage.name === "dead") {
    return (
      <div>
        <h2 className="text-xl font-medium text-foreground">This link can&apos;t be used</h2>
        <p className="mt-2 text-sm text-muted-foreground">{stage.message}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {stage.spent
            ? "Contact an active or a Founder's Education admin for a new one."
            : "Open the link from your message again to retry."}
        </p>
        <Button asChild variant="accent" className="mt-6 h-11 w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  if (stage.name === "done") {
    return (
      <div>
        <CheckCircle2 className="h-9 w-9 text-success-ink" />
        <h2 className="mt-4 text-xl font-medium text-foreground">All set</h2>
        <p className="mt-2 text-sm text-muted-foreground">{stage.message}</p>
        <Button asChild variant="accent" className="mt-6 h-11 w-full">
          <Link href="/login?notice=password_updated">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      {welcome.current ? <SetupProgress current="password" /> : null}
      <h2 className="text-xl font-medium text-foreground">
        {welcome.current ? `Welcome to ${PROGRAM_NAME}. Choose your password` : "Choose a new password"}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {welcome.current ? "An admin has set up your account. " : ""}
        You&apos;ll use it with <span className="text-foreground">{stage.email}</span> to sign in.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-danger-border bg-danger-subtle px-3 py-2.5 text-sm text-danger-ink"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <PasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          owner={{ email: stage.email }}
          email={stage.email}
          disabled={busy}
        />
      </div>

      <Button type="submit" variant="accent" disabled={!ready || busy} className="mt-6 h-11 w-full">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {welcome.current ? "Save and continue" : "Save password"}
      </Button>
    </form>
  );
};

export default ResetForm;
