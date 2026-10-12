import type { Metadata } from "next";
import PortalSessionProvider from "@/components/PortalComponents/portal-session";
import PortalShell from "@/components/PortalComponents/portal-shell";
import { PortalThemeProvider } from "@/components/PortalComponents/portal-theme";

export const metadata: Metadata = {
  title: {
    default: "Founder's Education Portal",
    template: "%s | Founder's Education Portal",
  },
  description: "The members-only Founder's Education portal for Sigma Eta Pi at UC Irvine.",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <PortalThemeProvider>
      <PortalSessionProvider>
        <PortalShell>{children}</PortalShell>
      </PortalSessionProvider>
    </PortalThemeProvider>
  );
}
