import type { Metadata } from "next";
import { ActivitySession } from "@/components/PortalAdminComponents/activity-session";

export const metadata: Metadata = { title: "Session" };

export default async function ActivitySessionPage({
  params,
}: {
  params: Promise<{ uid: string; sessionId: string }>;
}) {
  const { uid, sessionId } = await params;
  return <ActivitySession uid={uid} sessionId={sessionId} />;
}
