import type { Metadata } from "next";
import ReviewGuide from "@/components/PortalReviewComponents/review-guide";

export const metadata: Metadata = { title: "Guide" };

export default function ReviewGuidePage() {
  return <ReviewGuide />;
}
