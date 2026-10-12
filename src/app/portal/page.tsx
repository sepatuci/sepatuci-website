import type { Metadata } from "next";
import PledgeDashboard from "@/components/PortalComponents/pledge-dashboard";

export const metadata: Metadata = { title: "Deliverables" };

export default function PortalHomePage() {
  return <PledgeDashboard />;
}
