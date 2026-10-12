"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { authErrorCode, describeAuthError } from "@/lib/portal/auth-errors";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { getPortalAuth, isEmulatorPreview } from "@/lib/portal/client/firebase";
import { TIMING } from "@/lib/portal/constants";
import { looksTemporary, passwordProblem, type PasswordOwner } from "@/lib/portal/password";
import { safeNextPath } from "@/lib/portal/safe-redirect";
import type { MeDto } from "@/lib/portal/types";
import { PasswordFields } from "./password-fields";
import SetupProgress from "./setup-progress";

type Step =
  | { name: "checking" }
  | { name: "unconfigured" }
  | { name: "credentials" }
  // brandNew: an account that has never been set up, as opposed to a member
  // whose password a chair replaced.
  | { name: "new_password"; email: string; displayName: string; brandNew: boolean }
  | { name: "redirecting" };

// The address bar only ever carries one of these keys, never free text.
const NOTICES = {
  idle: "You were signed out after 30 minutes of inactivity.",
  ended: "Your session ended. Sign in again to continue.",
  signed_out: "You've been signed out.",
  signed_out_here:
    "Signed out here, but we couldn't confirm your other devices. If you're signed in elsewhere, sign in and sign out once more.",
  password_updated: "Your password is set. Sign in with it to continue.",
} as const;

/** Looks a notice up by its own key only, so a crafted address cannot reach anything inherited. */
function noticeFor(key: string | null): string | null {
  const known = key !== null && Object.prototype.hasOwnProperty.call(NOTICES, key);
  return known ? NOTICES[key as keyof typeof NOTICES] : null;
}

const NO_ACCESS = "This account doesn't have access to the portal.";
// The choose-a-password step was left open past its limit. Not in NOTICES, so
// the address bar cannot show it.
const SETUP_TIMED_OUT =
  "That took too long. Sign in with your temporary password again to choose your own.";
// The portal signs in with a password alone. An account that has had an
// authenticator attached through Firebase directly cannot be signed in here.
const HAS_SECOND_FACTOR =
  "This account has an extra sign-in step switched on that the portal doesn't use. Contact a Founder's Education admin to have it cleared.";

const LoginFlow: React.FC = () => {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const preview = isEmulatorPreview ? params.get("preview") : null;

  const [step, setStep] = useState<Step>({ name: "checking" });
  const [notice, setNotice] = useState<string | null>(noticeFor(params.get("notice")));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  // The password typed to sign in, held only until the account's next step is
  // known. It is in a ref, not on the page, and is cleared as soon as it is used.
  const typed = useRef("");
  // The temporary password someone signed in with, so that the next step can
  // rule it out as their new one. Gone once that step ends.
  const issued = useRef<string | null>(null);
  // Set once a new password has been accepted. Whatever goes wrong afterwards,
  // the person is told to sign in with it, never that nothing happened.
  const saved = useRef(false);

  /** Returns to the first screen, signed out, with a message. */
  const restart = useCallback(async (message: string | null, asNotice = false) => {
    const auth = getPortalAuth();
    if (auth?.currentUser) await signOut(auth).catch(() => undefined);
    typed.current = "";
    issued.current = null;
    const passwordSaved = saved.current;
    saved.current = false;
    setPassword("");
    setNewPassword("");
    setConfirm("");
    setSaving(false);
    setBusy(false);
    setError(asNotice || passwordSaved ? null : message);
    setNotice(passwordSaved ? NOTICES.password_updated : asNotice ? message : null);
    setStep({ name: "credentials" });
  }, []);

  /**
   * Asks the server whether this sign-in is good enough. The server is the
   * only judge of that; this page only follows its answer.
   */
  const proceed = useCallback(
    async (): Promise<"password" | void> => {
      try {
        const me = await apiFetch<MeDto>("/me");
        setStep({ name: "redirecting" });
        router.replace(safeNextPath(next, me.role));
      } catch (caught) {
        if (!(caught instanceof ApiError)) return restart(describeAuthError(caught, "sign_in"));
        // Still on the password a chair handed out. Nothing else opens until it is replaced.
        if (caught.code === "password_change_required") return "password";
        // Its three days have run out. A chair gives a new one.
        if (caught.code === "temporary_password_expired") return restart(caught.message);
        if (caught.status === 403) return restart(NO_ACCESS);
        if (caught.status === 401) return restart(NOTICES.ended);
        return restart(caught.message);
      }
    },
    [next, restart, router],
  );

  useEffect(() => {
    if (preview === "password") {
      setStep({ name: "new_password", email: "you@uci.edu", displayName: "", brandNew: true });
      return;
    }
    const auth = getPortalAuth();
    if (!auth) {
      setStep({ name: "unconfigured" });
      return;
    }
    let cancelled = false;
    auth.authStateReady().then(() => {
      if (cancelled) return;
      const user = auth.currentUser;
      if (!user) {
        setStep({ name: "credentials" });
        return;
      }
      void afterSignIn(user);
    });
    return () => {
      cancelled = true;
    };
    // Runs once on arrival. Later steps drive themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Shows the step where a temporary password is replaced. */
  const askForPassword = async (user: User) => {
    // The account says whether it is brand new. A member whose password a chair
    // replaced is not walked through setting up an account they already have.
    const claims = await user.getIdTokenResult().then(
      (result) => result.claims,
      () => null,
    );
    const brandNew = claims?.tempNew === true;
    setBusy(false);
    setSaving(false);
    setError(null);
    setStep({
      name: "new_password",
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      brandNew,
    });
  };

  /**
   * Carries a signed-in account on to whatever it needs next. Every way of
   * signing in ends here: a password typed just now, or
   * coming back to this page already signed in.
   */
  const afterSignIn = async (user: User) => {
    const needs = await proceed();
    const secret = typed.current;
    typed.current = "";
    if (needs !== "password") return;
    // Someone who has already chosen a password through an emailed link has
    // nothing left to choose. Their password is kept and the step is skipped.
    const alreadyOwn =
      secret.length > 0 &&
      passwordProblem(secret, {
        email: user.email,
        displayName: user.displayName,
        temporary: true,
      }) === null;
    if (alreadyOwn && (await savePassword(user, secret, true))) return;
    issued.current = looksTemporary(secret) ? secret : null;
    await askForPassword(user);
  };

  /**
   * Sends the chosen password to the server, then signs in again with it: the
   * change ends every earlier sign-in, this one included. Returns false when
   * the server refused the password.
   */
  const savePassword = async (user: User, chosen: string, quiet = false): Promise<boolean> => {
    const auth = getPortalAuth();
    const address = user.email;
    if (!auth || !address) {
      await restart(NOTICES.ended);
      return true;
    }
    try {
      await apiFetch("/password", { method: "POST", body: { password: chosen } });
      // Quiet means nothing was chosen: a password the person already had was
      // only recorded as theirs, so there is nothing to announce as saved.
      saved.current = !quiet;
    } catch (caught) {
      // The temporary password ran out while this page was open.
      if (caught instanceof ApiError && caught.code === "temporary_password_expired") {
        await restart(caught.message);
        return true;
      }
      // Two answers are worth one more try at signing in with the chosen
      // password. "Not required" means it was already replaced, perhaps in
      // another tab. A 401 can mean the save went through and only the reply
      // was lost. If the sign-in then fails, nothing was saved and they start again.
      const worthATry =
        caught instanceof ApiError && (caught.code === "not_required" || caught.status === 401);
      if (!worthATry) {
        setSaving(false);
        setError(
          caught instanceof ApiError ? (caught.fields[0]?.message ?? caught.message) : errorMessage(caught),
        );
        return false;
      }
    }
    await signOut(auth).catch(() => undefined);
    await signIn(address, chosen, false);
    issued.current = null;
    setNewPassword("");
    setConfirm("");
    return true;
  };

  /** Signs in and carries on to whichever step the account needs next. */
  const signIn = async (address: string, secret: string, typedByHand: boolean) => {
    const auth = getPortalAuth();
    if (!auth) return;
    typed.current = typedByHand ? secret : "";
    try {
      const credential = await signInWithEmailAndPassword(auth, address, secret);
      // The typed password has done its job on the page. It is not kept there.
      setPassword("");
      await afterSignIn(credential.user);
    } catch (caught) {
      if (authErrorCode(caught) === "auth/multi-factor-auth-required") {
        typed.current = "";
        await restart(HAS_SECOND_FACTOR);
        return;
      }
      typed.current = "";
      if (!typedByHand) {
        // Signing in with the chosen password did not go through. If it was
        // saved they are told so; if not, they simply start again.
        await restart(NOTICES.ended, true);
        return;
      }
      setBusy(false);
      setError(describeAuthError(caught, "sign_in"));
    }
  };

  // The choose-a-password step does not wait forever. The server stops
  // accepting it this long after the sign-in, so a screen left open on a shared
  // computer goes back to the sign-in page with nothing kept.
  // It never fires while a save is on its way, which finishes by itself.
  const choosing = step.name === "new_password" && preview === null && !saving;
  useEffect(() => {
    if (!choosing) return;
    const timer = window.setTimeout(() => void restart(SETUP_TIMED_OUT, true), TIMING.passwordSetupMs);
    return () => window.clearTimeout(timer);
  }, [choosing, restart]);

  const submitCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!getPortalAuth() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    // A temporary password is all capitals. Typed in lower case on a phone, or
    // pasted with a space after it, it is still the same password.
    const secret = looksTemporary(password) ? password.trim().toUpperCase() : password;
    await signIn(email.trim(), secret, true);
  };

  const submitNewPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step.name !== "new_password" || busy) return;
    const owner: PasswordOwner = {
      email: step.email,
      displayName: step.displayName,
      temporary: issued.current ?? true,
    };
    if (passwordProblem(newPassword, owner) !== null || confirm !== newPassword) return;
    if (preview === "password") {
      setError("This is a preview. Nothing was saved.");
      return;
    }
    const user = getPortalAuth()?.currentUser;
    if (!user) return restart(NOTICES.ended);
    setBusy(true);
    setSaving(true);
    setError(null);
    if (!(await savePassword(user, newPassword))) setBusy(false);
  };

  if (step.name === "checking" || step.name === "redirecting") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground" role="status">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">{step.name === "checking" ? "Checking your session" : "Signing you in"}</span>
      </div>
    );
  }

  if (step.name === "unconfigured") {
    return (
      <div>
        <h2 className="text-xl font-medium text-foreground">The portal isn&apos;t open yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign-in will be available here once the Founder&apos;s Education admins finish setting it
          up. Check back soon.
        </p>
      </div>
    );
  }

  if (step.name === "new_password" && saving) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground" role="status">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Saving your password</span>
      </div>
    );
  }

  if (step.name === "new_password") {
    const owner: PasswordOwner = {
      email: step.email,
      displayName: step.displayName,
      temporary: issued.current ?? true,
    };
    const ready = passwordProblem(newPassword, owner) === null && confirm === newPassword;
    const firstName = step.displayName.split(" ")[0];
    return (
      <form onSubmit={submitNewPassword} noValidate>
        {step.brandNew ? <SetupProgress current="password" /> : null}
        <h2 className="text-xl font-medium text-foreground">
          {!step.brandNew
            ? "Choose a new password"
            : firstName
              ? `Welcome, ${firstName}. Choose your password`
              : "Choose your password"}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {step.brandNew
            ? "You signed in with a temporary password. Replace it with one only you know. You'll use it with "
            : "Your account needs a new password before you carry on. Choose one only you know, for "}
          <span className="text-foreground">{step.email}</span>
          {step.brandNew ? " from now on." : "."}
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
            password={newPassword}
            confirm={confirm}
            onPassword={setNewPassword}
            onConfirm={setConfirm}
            owner={owner}
            email={step.email}
            disabled={busy}
          />
        </div>

        <Button type="submit" variant="accent" disabled={!ready || busy} className="mt-6 h-11 w-full">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save and continue
        </Button>
        <button
          type="button"
          onClick={() => void restart(NOTICES.signed_out, true)}
          className="mt-4 block w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Not now, sign out
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} noValidate>
      <h2 className="text-xl font-medium text-foreground">Sign in</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Use your UCI email and your portal password.
      </p>

      {notice ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm text-accent-ink"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-danger-border bg-danger-subtle px-3 py-2.5 text-sm text-danger-ink"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <Label htmlFor="portal-email">UCI email</Label>
        <Input
          id="portal-email"
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@uci.edu"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div className="mt-4">
        <Label htmlFor="portal-password">Password</Label>
        <div className="relative">
          <Input
            id="portal-password"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        variant="accent"
        disabled={busy || email.trim().length === 0 || password.length === 0}
        className="mt-6 h-11 w-full"
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continue
      </Button>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Forgot your password? Contact an active or a Founder&apos;s Education admin.
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        New here? Use the temporary password an admin gave you, or the link you were sent.
      </p>
    </form>
  );
};

export default LoginFlow;
