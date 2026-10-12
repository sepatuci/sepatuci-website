import type { Metadata } from "next";
import ReviewPledge from "@/components/PortalReviewComponents/review-pledge";

export const metadata: Metadata = { title: "Pledge" };

export default async function ReviewPledgePage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return <ReviewPledge uid={uid} />;
}
