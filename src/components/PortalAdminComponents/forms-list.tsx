"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Copy, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  PageHeader,
  useToast,
  type Tone,
} from "@/components/PortalComponents/primitives";
import { apiFetch, errorMessage } from "@/lib/portal/client/api";
import { useApi } from "@/lib/portal/client/use-api";
import { formatDateTime } from "@/lib/portal/dates";
import type { AdminFormSummaryDto, AdminFormsDto, FormStatus } from "@/lib/portal/types";

export const STATUS_CHIPS: Record<FormStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "success" },
  archived: { label: "Archived", tone: "warning" },
};

function scheduleLine(form: AdminFormSummaryDto): string {
  const { opensAt, visibleAt, dueAt } = form.settings;
  const opens = opensAt ?? visibleAt;
  const parts = [
    opens ? `Opens ${formatDateTime(opens, true)}` : null,
    dueAt ? `Due ${formatDateTime(dueAt, true)}` : "No deadline",
  ];
  return parts.filter(Boolean).join(" · ");
}

/** Every deliverable form, with its schedule and how many pledges have turned it in. */
const FormsList: React.FC = () => {
  const router = useRouter();
  const notify = useToast();
  const { data, error, loading, reload } = useApi<AdminFormsDto>("/admin/forms");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminFormSummaryDto | null>(null);

  const create = async (duplicateOf?: string) => {
    if (creating) return;
    setCreating(true);
    setBusyId(duplicateOf ?? null);
    try {
      const created = await apiFetch<{ id: string }>("/admin/forms", {
        method: "POST",
        body: duplicateOf ? { duplicateOf } : {},
      });
      router.push(`/portal/admin/forms/${created.id}`);
    } catch (caught) {
      notify(errorMessage(caught), "danger");
      setCreating(false);
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await apiFetch(`/admin/forms/${deleting.id}`, { method: "DELETE" });
      notify("Deliverable deleted.", "success");
      setDeleting(null);
      reload();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setBusyId(null);
    }
  };

  const header = (
    <PageHeader
      title="Deliverables"
      subtitle="The forms pledges fill in for Founder's Education."
      actions={
        <Button variant="accent" onClick={() => void create()} disabled={creating}>
          {creating && busyId === null ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          New deliverable
        </Button>
      }
    />
  );

  if (loading && !data) return <>{header}<LoadingBlock label="Loading deliverables" /></>;
  if (error && !data) return <>{header}<ErrorNote error={error} onRetry={reload} /></>;
  if (!data) return null;

  if (data.forms.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="No deliverables yet"
          body="Create the first one. It stays a private draft until you publish it."
        />
      </>
    );
  }

  const titles = new Map(data.forms.map((form) => [form.id, form.title]));

  return (
    <>
      {header}
      <Card className="divide-y divide-border overflow-hidden">
        {data.forms.map((form) => {
          const chip = STATUS_CHIPS[form.status];
          const prerequisite = form.settings.prerequisiteFormId;
          return (
            <div key={form.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <Link href={`/portal/admin/forms/${form.id}`} className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{form.title}</span>
                  <Chip tone={chip.tone}>{chip.label}</Chip>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{scheduleLine(form)}</span>
                {prerequisite ? (
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Link2 className="h-3 w-3" />
                    Unlocks after &quot;{titles.get(prerequisite) ?? "a deleted deliverable"}&quot;
                  </span>
                ) : null}
              </Link>
              <div className="flex items-center gap-4">
                <span className="text-right">
                  <span className="block text-sm text-foreground">
                    {form.responseCount} {form.responseCount === 1 ? "response" : "responses"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {data.pledgeCount} active {data.pledgeCount === 1 ? "pledge" : "pledges"}
                  </span>
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Duplicate ${form.title}`}
                    title="Duplicate"
                    disabled={creating}
                    onClick={() => void create(form.id)}
                  >
                    {busyId === form.id && creating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${form.title}`}
                    title="Delete"
                    onClick={() => setDeleting(form)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete "${deleting?.title ?? ""}"?`}
        description="A deliverable can only be deleted if nobody has turned it in. Once it has responses, archive it from its Settings tab instead."
        confirmLabel="Delete"
        destructive
        busy={busyId !== null && busyId === deleting?.id}
        onConfirm={() => void remove()}
      />
    </>
  );
};

export default FormsList;
