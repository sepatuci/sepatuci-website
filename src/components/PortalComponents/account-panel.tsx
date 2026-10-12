"use client";

import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/portal/dates";
import { ROLE_DESCRIPTION } from "@/lib/portal/roles";
import type { Role } from "@/lib/portal/types";
import { usePortal } from "./portal-session";
import { Card, PageHeader } from "./primitives";
import { ThemeChoice } from "./theme-controls";

const ACCOUNT_NOTE: Record<Role, string> = {
  admin: "Admin accounts are managed by whoever maintains the portal, not from this page.",
  active: "To correct your name, ask a Founder's Education admin.",
  pledge: "To correct your name or team, ask a Founder's Education admin.",
};

const PASSWORD_NOTE: Record<Role, string> = {
  admin:
    "Admin passwords are replaced outside the portal: from the Firebase console, or with the setup script. The setup guide has the steps.",
  active:
    "To change it, or if you forget it, contact a Founder's Education admin. They give you a temporary one and you choose a new password at your next sign-in.",
  pledge:
    "To change it, or if you forget it, contact an active or a Founder's Education admin. An admin gives you a temporary one and you choose a new password at your next sign-in.",
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="text-sm text-foreground">{children}</dd>
  </div>
);

const AccountPanel: React.FC = () => {
  const { me, signOut } = usePortal();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Account" subtitle="Your sign-in details for the portal." />

      <Card className="overflow-hidden">
        <dl className="divide-y divide-border">
          <Row label="Name">{me.displayName}</Row>
          <Row label="Email">{me.email}</Row>
          <Row label="Role">{ROLE_DESCRIPTION[me.role]}</Row>
          {me.pledgeClass ? <Row label="Class">{me.pledgeClass}</Row> : null}
          {me.role === "pledge" ? (
            <Row label="Team">{me.team ? me.team.name : "Working individually"}</Row>
          ) : null}
          {me.team && me.team.teammates.length > 0 ? (
            <Row label="Teammates">{me.team.teammates.join(", ")}</Row>
          ) : null}
          {me.createdAt ? <Row label="Account created">{formatDate(me.createdAt)}</Row> : null}
        </dl>
      </Card>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        {ACCOUNT_NOTE[me.role]}
      </p>

      <h2 className="mb-3 mt-10 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Appearance
      </h2>
      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-foreground">Light or dark</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Saved on this device.</p>
        </div>
        <ThemeChoice />
      </Card>

      <h2 className="mb-3 mt-10 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Security
      </h2>
      <Card>
        <div className="flex items-start gap-3 px-5 py-4">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" />
          <div>
            <p className="text-sm font-medium text-foreground">Password</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{PASSWORD_NOTE[me.role]}</p>
          </div>
        </div>
      </Card>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        You&apos;re signed out after 30 idle minutes, when this tab closes, and 12 hours after
        signing in. Sign out ends it on every device.
      </p>

      <Button variant="outline" onClick={() => void signOut()} className="mt-8">
        Sign out
      </Button>
    </div>
  );
};

export default AccountPanel;
