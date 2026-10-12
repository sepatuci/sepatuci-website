import type { Metadata } from "next";
import WelcomeTour from "@/components/PortalComponents/welcome-tour";

export const metadata: Metadata = { title: "Welcome" };

export default function ReviewWelcomePage() {
  return <WelcomeTour />;
}
