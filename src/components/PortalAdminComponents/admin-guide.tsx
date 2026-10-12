"use client";

import Link from "next/link";
import { GuideTopicBlock } from "@/components/PortalComponents/guide-sections";
import { Card, ErrorNote, LoadingBlock, PageHeader } from "@/components/PortalComponents/primitives";
import { useApi } from "@/lib/portal/client/use-api";
import { ADMIN_TOPICS } from "@/lib/portal/guide";
import type { AdminOverviewDto } from "@/lib/portal/types";
import GettingStarted from "./getting-started";

/** How the portal works for the people running Founder's Education. */
const AdminGuide: React.FC = () => {
  const { data, error, loading, reload } = useApi<AdminOverviewDto>("/admin/pledges");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Guide"
        subtitle="How to run Founder's Education from this portal, and what new members see."
      />
      <div className="space-y-5">
        {loading && !data ? <LoadingBlock label="Checking your progress" /> : null}
        {error && !data ? <ErrorNote error={error} onRetry={reload} /> : null}
        {data ? <GettingStarted overview={data} /> : null}

        {ADMIN_TOPICS.map((topic) => (
          <Card key={topic.title} className="p-6 sm:p-8">
            <GuideTopicBlock topic={topic} />
          </Card>
        ))}

        <Card className="p-6 sm:p-8">
          <h2 className="text-lg font-medium text-foreground">What a new member goes through</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-foreground">
            <li>
              They sign in with the temporary password you gave them, or open the emailed link, and
              choose their own password.
            </li>
            <li>
              They are shown a short introduction to Sigma Eta Pi, Founder&apos;s Education and how
              deliverables work.
            </li>
            <li>They land on their deliverables. The introduction stays available to them under Guide.</li>
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            On the{" "}
            <Link href="/portal/admin" className="text-accent-ink underline-offset-4 hover:underline">
              New members page
            </Link>
            , each account shows how far along these steps it is.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default AdminGuide;
