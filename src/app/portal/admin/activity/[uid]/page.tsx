import type { Metadata } from "next";
import { ActivityPerson } from "@/components/PortalAdminComponents/activity-person";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPersonPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return <ActivityPerson uid={uid} />;
}
