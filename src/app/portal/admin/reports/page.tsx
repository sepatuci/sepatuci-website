import type { Metadata } from "next";
import { ReportsPanel } from "@/components/PortalAdminComponents/reports-panel";

export const metadata: Metadata = { title: "Reports" };

export default function AdminReportsPage() {
  return <ReportsPanel />;
}
