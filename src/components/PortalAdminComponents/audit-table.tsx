"use client";

import { useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  PageHeader,
  useToast,
} from "@/components/PortalComponents/primitives";
import { apiFetch, errorMessage } from "@/lib/portal/client/api";
import { useApi } from "@/lib/portal/client/use-api";
import { formatDateTime } from "@/lib/portal/dates";
import type { AuditEntryDto, AuditLogDto } from "@/lib/portal/types";

const ACTIONS: Record<string, string> = {
  "pledge.create": "Created a pledge account",
  "pledge.update": "Edited a pledge",
  "pledge.disable": "Disabled an account",
  "pledge.enable": "Re-enabled an account",
  "pledge.remove": "Removed an account",
  "pledge.reset_mfa": "Reset two-step verification",
  "pledge.invite_link": "Created a set-password link",
  "pledge.temporary_password": "Issued a temporary password",
  "active.create": "Created an active's account",
  "active.update": "Edited an active",
  "active.disable": "Disabled an active's account",
  "active.enable": "Re-enabled an active's account",
  "active.remove": "Removed an active's account",
  "active.reset_mfa": "Reset an active's two-step verification",
  "active.invite_link": "Created a set-password link for an active",
  "active.temporary_password": "Issued a temporary password to an active",
  "team.create": "Created a team",
  "team.update": "Edited a team",
  "team.delete": "Deleted a team",
  "punishment.add": "Added a punishment",
  "punishment.update": "Edited a punishment",
  "punishment.resolve": "Resolved a punishment",
  "punishment.reopen": "Reopened a punishment",
  "punishment.remove": "Removed a punishment",
  "form.create": "Created a deliverable",
  "form.duplicate": "Duplicated a deliverable",
  "form.update": "Edited a deliverable",
  "form.publish": "Published a deliverable",
  "form.unpublish": "Unpublished a deliverable",
  "form.archive": "Archived a deliverable",
  "form.delete": "Deleted a deliverable",
  "response.reopen": "Deleted a response",
};

/** A record of every change an admin has made in the portal. */
const AuditTable: React.FC = () => {
  const notify = useToast();
  const { data, error, loading, reload } = useApi<AuditLogDto>("/admin/audit");
  const [entries, setEntries] = useState<AuditEntryDto[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEntries(data.entries);
    setNextBefore(data.nextBefore);
  }, [data]);

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiFetch<AuditLogDto>(`/admin/audit?before=${encodeURIComponent(nextBefore)}`);
      setEntries((current) => [...current, ...page.entries]);
      setNextBefore(page.nextBefore);
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setLoadingMore(false);
    }
  };

  const header = (
    <PageHeader
      title="Activity"
      subtitle="Every change an admin has made to accounts, punishments and deliverables."
    />
  );

  if (loading && !data) return <>{header}<LoadingBlock label="Loading activity" /></>;
  if (error && !data) return <>{header}<ErrorNote error={error} onRetry={reload} /></>;

  if (entries.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon={<ScrollText className="h-8 w-8" />} title="Nothing has been changed yet" />
      </>
    );
  }

  return (
    <>
      {header}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">When</th>
                <th scope="col" className="px-5 py-3 font-medium">Admin</th>
                <th scope="col" className="px-5 py-3 font-medium">Action</th>
                <th scope="col" className="px-5 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                    {formatDateTime(entry.at, true)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-foreground">{entry.actorEmail}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-foreground">
                    {ACTIONS[entry.action] ?? entry.action}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{entry.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {nextBefore ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load older activity
          </Button>
        </div>
      ) : null}
    </>
  );
};

export default AuditTable;
