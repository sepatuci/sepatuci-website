import type { Metadata } from "next";
import ReviewDeliverables from "@/components/PortalReviewComponents/review-deliverables";

export const metadata: Metadata = { title: "Deliverables" };

export default function ReviewDeliverablesPage() {
  return <ReviewDeliverables />;
}
