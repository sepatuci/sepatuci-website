import type { Metadata } from "next";
import FormsList from "@/components/PortalAdminComponents/forms-list";

export const metadata: Metadata = { title: "Deliverables" };

export default function AdminFormsPage() {
  return <FormsList />;
}
