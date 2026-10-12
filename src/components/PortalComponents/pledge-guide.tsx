import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ABOUT_PROGRAM,
  ABOUT_SEP,
  BEFORE_YOU_START,
  HOW_DELIVERABLES_WORK,
} from "@/lib/portal/guide";
import { GuideTopicBlock, StateLegend } from "./guide-sections";
import { Card, PageHeader } from "./primitives";

/** The welcome tour's content as a page a pledge can come back to. */
const PledgeGuide: React.FC = () => (
  <div className="mx-auto max-w-3xl">
    <PageHeader
      title="Guide"
      subtitle="What Sigma Eta Pi and Founder's Education are, and how this portal works."
      actions={
        <Button asChild variant="accent">
          <Link href="/portal">Go to my deliverables</Link>
        </Button>
      }
    />
    <div className="space-y-5">
      <Card className="space-y-8 p-6 sm:p-8">
        <GuideTopicBlock topic={ABOUT_SEP} />
        <GuideTopicBlock topic={ABOUT_PROGRAM} />
      </Card>
      <Card className="space-y-6 p-6 sm:p-8">
        <GuideTopicBlock topic={HOW_DELIVERABLES_WORK} />
        <StateLegend />
      </Card>
      <Card className="p-6 sm:p-8">
        <GuideTopicBlock topic={BEFORE_YOU_START} />
      </Card>
    </div>
  </div>
);

export default PledgeGuide;
