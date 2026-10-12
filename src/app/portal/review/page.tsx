import type { Metadata } from "next";
import ReviewOverview from "@/components/PortalReviewComponents/review-overview";

export const metadata: Metadata = { title: "Pledges" };

export default function ReviewPage() {
  return <ReviewOverview />;
}
