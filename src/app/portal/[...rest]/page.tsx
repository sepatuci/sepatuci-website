import type { Metadata } from "next";
import PortalNotFound from "@/components/PortalComponents/portal-not-found";

export const metadata: Metadata = { title: "Not found" };

// Catches any portal address with no page of its own, so it gets the portal's
// "not here" screen and not the public site's.
export default function PortalCatchAllPage() {
  return <PortalNotFound />;
}
