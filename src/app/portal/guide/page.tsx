import type { Metadata } from "next";
import PledgeGuide from "@/components/PortalComponents/pledge-guide";

export const metadata: Metadata = { title: "Guide" };

export default function GuidePage() {
  return <PledgeGuide />;
}
