import type { Metadata } from "next";
import SubmissionView from "@/components/PortalFormComponents/submission-view";

export const metadata: Metadata = { title: "Your response" };

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  return <SubmissionView formId={formId} />;
}
