import type { Metadata } from "next";
import MasterView from "@/components/PortalAdminComponents/master-view";

export const metadata: Metadata = { title: "New members" };

export default function AdminHomePage() {
  return <MasterView />;
}
