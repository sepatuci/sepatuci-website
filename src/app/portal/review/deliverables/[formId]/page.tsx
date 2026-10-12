import { Suspense } from "react";
import type { Metadata } from "next";
import ReviewForm from "@/components/PortalReviewComponents/review-form";

export const metadata: Metadata = { title: "Responses" };

export default async function ReviewFormPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  return (
    <Suspense fallback={null}>
      <ReviewForm formId={formId} />
    </Suspense>
  );
}
