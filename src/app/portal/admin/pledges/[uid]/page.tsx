import type { Metadata } from "next";
import PledgeDetail from "@/components/PortalAdminComponents/pledge-detail";

export const metadata: Metadata = { title: "Pledge" };

export default async function PledgePage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return <PledgeDetail uid={uid} />;
}
