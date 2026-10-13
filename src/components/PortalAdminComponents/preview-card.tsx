"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Card, Chip, ConfirmDialog, useToast, type Tone } from "@/components/PortalComponents/primitives";
import { ApiError, apiFetch, errorMessage } from "@/lib/portal/client/api";
import { formatDate } from "@/lib/portal/dates";
import type { MemberRole, PreviewStage, PreviewStartResultDto, PreviewStateDto } from "@/lib/portal/types";

interface PreviewCardProps {
  /** The admin's own preview account, if they have one. */
  preview: PreviewStateDto | null;
  /** Called after a preview account was started or removed, so the page can refresh. */
  onChanged: () => void;
}

const BODY =
  "Go through a new pledge's first visit in a separate tab, from signing in with a temporary password to the welcome and the dashboard. Nothing you do there affects real members.";

const STAGES: Record<PreviewStage, { label: string; tone: Tone }> = {
  ready: { label: "Ready for a first sign-in", tone: "accent" },
  in_progress: { label: "In progress", tone: "success" },
};
const NO_PREVIEW = { label: "No preview account yet", tone: "neutral" as const };

const ROLES: MemberRole[] = ["pledge", "active"];
/** What each sandbox is called, and the same with "a new" in front for the buttons. */
const NOUN: Record<MemberRole, string> = { pledge: "pledge", active: "active" };
const AS_NEW: Record<MemberRole, string> = { pledge: "a new pledge", active: "a new active" };

/** What the server's refusals mean here. Anything else shows the server's own message. */
const REFUSALS: Record<string, string> = {
  preview_email_taken: "Another admin's preview account already uses that address.",
};

function refusalMessage(caught: unknown): string {
  if (caught instanceof ApiError && Object.prototype.hasOwnProperty.call(REFUSALS, caught.code)) {
    return REFUSALS[caught.code];
  }
  return errorMessage(caught);
}

/** What is waiting on a confirmation: removing the sandbox, or replacing it with one of the other role. */
type Pending = { kind: "remove" } | { kind: "start"; role: MemberRole; replaces: MemberRole };

/**
 * Lets an admin start, open and remove their own preview account: a sandbox
 * pledge or active for going through a new pledge's first visit. One per
 * admin, so starting one as the other role replaces it.
 */
const PreviewCard: React.FC<PreviewCardProps> = ({ preview, onChanged }) => {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  // The one-time code, held only while its window is open.
  const [ready, setReady] = useState<PreviewStartResultDto | null>(null);

  const stage = preview ? STAGES[preview.stage] : NO_PREVIEW;

  const start = async (role: MemberRole) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await apiFetch<PreviewStartResultDto>("/admin/preview", { method: "POST", body: { role } });
      setPending(null);
      setReady(result);
      onChanged();
    } catch (caught) {
      notify(refusalMessage(caught), "danger");
    } finally {
      setBusy(false);
    }
  };

  /** Starting over throws the current sandbox away, so with one in place that asks first. */
  const askOrStart = (role: MemberRole) => {
    if (preview) {
      setPending({ kind: "start", role, replaces: preview.role });
      return;
    }
    void start(role);
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch("/admin/preview", { method: "DELETE" });
      notify("Preview account removed.", "success");
      setPending(null);
      onChanged();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-medium text-foreground">Preview the portal</h2>
              <Chip tone={stage.tone}>{stage.label}</Chip>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{BODY}</p>
            {preview ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {preview.displayName} · {preview.email} · started {formatDate(preview.createdAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => (
              <Button key={role} variant="outline" size="sm" disabled={busy} onClick={() => askOrStart(role)}>
                {preview ? `Start over as ${AS_NEW[role]}` : `Preview as ${AS_NEW[role]}`}
              </Button>
            ))}
            {preview?.role === "pledge" ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/portal/admin/pledges/${preview.uid}`}>Open the pledge&apos;s page</Link>
              </Button>
            ) : null}
            {preview ? (
              <Button
                variant="outline"
                size="sm"
                className="border-danger-border text-danger-ink hover:bg-danger-subtle hover:text-danger-ink"
                disabled={busy}
                onClick={() => setPending({ kind: "remove" })}
              >
                Remove preview account
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Dialog open={ready !== null} onOpenChange={(open) => (open ? undefined : setReady(null))}>
        <DialogContent
          title="Your preview is ready"
          description="Open the link below in a new tab and sign in as the preview account. The link works once and expires in 5 minutes."
        >
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
            {ready ? (
              <Button asChild variant="accent">
                <a href={`/login#preview=${ready.code}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open the preview in a new tab
                </a>
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        title={
          pending?.kind === "start" ? `Start over as ${AS_NEW[pending.role]}?` : "Remove preview account?"
        }
        description={
          pending?.kind === "start"
            ? `This removes your ${NOUN[pending.replaces]} preview and everything it did.`
            : "Deletes the preview account and everything it did. You can start a new one any time."
        }
        confirmLabel={pending?.kind === "start" ? "Start over" : "Remove preview account"}
        destructive
        busy={busy}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === "start") void start(pending.role);
          else void remove();
        }}
      />
    </>
  );
};

export default PreviewCard;
