import type { Metadata } from "next";
import AdminGuide from "@/components/PortalAdminComponents/admin-guide";

export const metadata: Metadata = { title: "Guide" };

export default function AdminGuidePage() {
  return <AdminGuide />;
}
