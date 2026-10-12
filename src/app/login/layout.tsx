import { PortalThemeProvider } from "@/components/PortalComponents/portal-theme";

/** The sign-in pages share the portal's light and dark mode. */
export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PortalThemeProvider>{children}</PortalThemeProvider>;
}
