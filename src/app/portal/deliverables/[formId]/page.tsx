import type { Metadata } from "next";
import FormFiller from "@/components/PortalFormComponents/form-filler";

export const metadata: Metadata = { title: "Deliverable" };

export default async function DeliverablePage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  return <FormFiller formId={formId} />;
}
