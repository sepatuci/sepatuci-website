import Image from "next/image";
import Link from "next/link";
import sepLogo from "@/assets/logos/sep_logos/sep_white.png";
import { ThemeToggle } from "@/components/PortalComponents/theme-controls";
import { ORG_NAME, PORTAL_NAME } from "@/lib/portal/constants";

interface AuthShellProps {
  children: React.ReactNode;
}

/** The frame shared by the sign-in, forgot-password and set-password pages. */
const AuthShell: React.FC<AuthShellProps> = ({ children }) => (
  <div className="portal-auth-backdrop flex min-h-screen flex-col bg-background font-normal text-foreground">
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
      <Link
        href="/"
        className="flex items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Image src={sepLogo} alt="" width={80} height={32} className="portal-logo h-8 w-auto" />
        <span>Back to sepatuci.com</span>
      </Link>
      <ThemeToggle />
    </header>

    <div className="flex flex-1 items-start justify-center px-4 pb-20 pt-8 sm:pt-14">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-accent-ink">{ORG_NAME}</p>
          <h1 className="mt-3 text-3xl font-light tracking-tight text-foreground">{PORTAL_NAME}</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">{children}</div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Accounts are created by the Founder&apos;s Education chairs. There is no sign-up.
        </p>
      </div>
    </div>
  </div>
);

export default AuthShell;
