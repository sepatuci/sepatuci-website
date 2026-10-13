import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GuideTopicBlock, StateLegend } from "@/components/PortalComponents/guide-sections";
import { Card, PageHeader } from "@/components/PortalComponents/primitives";
import { ABOUT_PROGRAM, ACTIVE_TOPICS } from "@/lib/portal/guide";

/** What an active can see here, and what the labels mean. */
const ReviewGuide: React.FC = () => (
  <div className="mx-auto max-w-3xl">
    <PageHeader
      title="Guide"
      subtitle="What you can see as an active, and how to read it."
      actions={
        <Button asChild variant="accent">
          <Link href="/portal/review">Go to pledges</Link>
        </Button>
      }
    />
    <div className="space-y-5">
      {ACTIVE_TOPICS.map((topic) => (
        <Card key={topic.title} className="p-6 sm:p-8">
          <GuideTopicBlock topic={topic} />
        </Card>
      ))}
      <Card className="space-y-6 p-6 sm:p-8">
        <GuideTopicBlock topic={ABOUT_PROGRAM} />
        <StateLegend />
      </Card>
    </div>
  </div>
);

export default ReviewGuide;
