import type { Metadata } from "next";
import ActivesPanel from "@/components/PortalAdminComponents/actives-panel";

export const metadata: Metadata = { title: "Actives" };

export default function AdminActivesPage() {
  return <ActivesPanel />;
}
