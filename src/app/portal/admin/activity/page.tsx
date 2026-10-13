import type { Metadata } from "next";
import { ActivityPanel } from "@/components/PortalAdminComponents/activity-panel";

export const metadata: Metadata = { title: "Activity" };

export default function AdminActivityPage() {
  return <ActivityPanel />;
}
