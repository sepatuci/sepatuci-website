import type { Metadata } from "next";
import PeoplePanel from "@/components/PortalAdminComponents/people-panel";

export const metadata: Metadata = { title: "People" };

export default function AdminPeoplePage() {
  return <PeoplePanel />;
}
