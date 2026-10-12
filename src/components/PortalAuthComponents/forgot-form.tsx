"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { authErrorCode, describeAuthError } from "@/lib/portal/auth-errors";
import { getPortalAuth } from "@/lib/portal/client/firebase";

// Errors that are worth telling the person about. Everything else, including
// "no such account", looks the same as success so the page cannot be used to
// find out who has an account.
const REPORTED = new Set([
  "auth/invalid-email",
  "auth/missing-email",
  "auth/network-request-failed",
  "auth/too-many-requests",
  "auth/quota-exceeded",
]);

const ForgotForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const auth = getPortalAuth();
    const address = email.trim();
    if (busy || address.length === 0) return;
    if (!auth) {
      setError("The portal isn't open yet. Check back soon.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      try {
        await sendPasswordResetEmail(auth, address, { url: `${window.location.origin}/login` });
      } catch (caught) {
        // The return address is optional. If the project has not approved this
        // domain yet, the email is still sent without it.
        const code = authErrorCode(caught);
        if (code !== "auth/unauthorized-continue-uri" && code !== "auth/invalid-continue-uri") {
          throw caught;
        }
        await sendPasswordResetEmail(auth, address);
      }
      setSentTo(address);
    } catch (caught) {
      if (REPORTED.has(authErrorCode(caught))) setError(describeAuthError(caught, "forgot"));
      else setSentTo(address);
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent-ink">
          <MailCheck className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-xl font-medium text-foreground">Check your email</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          If <span className="text-foreground">{sentTo}</span> has a portal account, a link to set a
          new password is on its way. It expires in about an hour. Give it a few minutes, and check
          spam.
        </p>
        <Link href="/login" className="mt-6 block">
          <Button variant="accent" className="h-11 w-full">
            Back to sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="text-xl font-medium text-foreground">Reset your password</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter your UCI email and we&apos;ll send a link to set a new password. This is also how you
        set your password the first time.
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
        <Label htmlFor="portal-forgot-email">UCI email</Label>
        <Input
          id="portal-forgot-email"
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@uci.edu"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
      </div>

      <Button
        type="submit"
        variant="accent"
        disabled={busy || email.trim().length === 0}
        className="mt-6 h-11 w-full"
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Send reset link
      </Button>
      <Link
        href="/login"
        className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </Link>
    </form>
  );
};

export default ForgotForm;
