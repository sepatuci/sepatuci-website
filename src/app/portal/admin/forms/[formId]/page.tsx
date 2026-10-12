import { Suspense } from "react";
import type { Metadata } from "next";
import FormEditor from "@/components/PortalAdminComponents/form-editor";

export const metadata: Metadata = { title: "Edit deliverable" };

export default async function AdminFormPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  return (
    <Suspense fallback={null}>
      <FormEditor formId={formId} />
    </Suspense>
  );
}
