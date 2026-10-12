import type { Metadata } from "next";
import AuditTable from "@/components/PortalAdminComponents/audit-table";

export const metadata: Metadata = { title: "Activity" };

export default function AdminActivityPage() {
  return <AuditTable />;
}
