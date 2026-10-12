import type { Metadata } from "next";
import TeamsPanel from "@/components/PortalAdminComponents/teams-panel";

export const metadata: Metadata = { title: "Teams" };

export default function AdminTeamsPage() {
  return <TeamsPanel />;
}
