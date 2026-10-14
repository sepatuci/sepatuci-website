"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import sepLogo from "@/assets/logos/sep_logos/sep_white.png";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/portal/client/use-api";
import { PROGRAM_NAME } from "@/lib/portal/constants";
import { PORTAL_LABEL, ROLE_HOME } from "@/lib/portal/roles";
import type { MemberRole, ReportCountDto, Role } from "@/lib/portal/types";
import { cn } from "@/lib/utils";
import { usePortal, WELCOME_PATH } from "./portal-session";
import { ToastProvider } from "./primitives";
import { REPORTS_CHANGED_EVENT, ReportButton } from "./report-dialog";
import { ThemeToggle } from "./theme-controls";

interface NavItem {
  href: string;
  label: string;
  /** Other paths that should also light this item up. */
  match?: string[];
}

const REPORTS_PAGE = "/portal/admin/reports";

// One entry per role, so a new role cannot quietly inherit another's navigation.
const NAV: Record<Role, NavItem[]> = {
  pledge: [
    { href: "/portal", label: "Deliverables", match: ["/portal/deliverables"] },
    { href: "/portal/history", label: "History" },
    { href: "/portal/guide", label: "Guide" },
    { href: "/portal/account", label: "Account" },
  ],
  active: [
    { href: "/portal/review", label: "Pledges", match: ["/portal/review/pledges"] },
    { href: "/portal/review/deliverables", label: "Deliverables" },
    { href: "/portal/review/guide", label: "Guide" },
    { href: "/portal/account", label: "Account" },
  ],
  admin: [
    { href: "/portal/admin", label: "Pledges", match: ["/portal/admin/pledges"] },
    { href: "/portal/admin/people", label: "People" },
    { href: "/portal/admin/teams", label: "Teams" },
    { href: "/portal/admin/forms", label: "Deliverables" },
    { href: "/portal/admin/activity", label: "Activity" },
    { href: REPORTS_PAGE, label: "Reports" },
    { href: "/portal/admin/guide", label: "Guide" },
    { href: "/portal/account", label: "Account" },
  ],
};

const HOMES: readonly string[] = Object.values(ROLE_HOME);

/** What an admin going through a new member's first visit is told, on every page. */
const PREVIEW_BANNER: Record<MemberRole, string> = {
  pledge: "You're previewing the portal as a pledge. Nothing you do here affects real pledges.",
  active: "You're previewing the portal as an active. Nothing you do here affects real members.",
};

function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  const prefixes = [...(item.match ?? [])];
  // The home tabs are exact matches only, or they would claim every page beneath them.
  if (!HOMES.includes(item.href)) prefixes.push(item.href);
  return prefixes.some((prefix) => pathname.startsWith(`${prefix}/`) || pathname === prefix);
}

/**
 * How many reports are waiting for an admin, for the count on the Reports
 * link. Checked again on each page change and whenever a report is marked,
 * never on a timer. Zero for everyone else, who never asks.
 */
function useNewReports(admin: boolean, pathname: string): number {
  const { data, reload } = useApi<ReportCountDto>(admin ? "/admin/reports/count" : null);
  const first = useRef(true);

  useEffect(() => {
    // The first load comes from useApi itself.
    if (first.current) {
      first.current = false;
      return;
    }
    if (admin) reload();
  }, [admin, pathname, reload]);

  useEffect(() => {
    if (!admin) return;
    window.addEventListener(REPORTS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(REPORTS_CHANGED_EVENT, reload);
  }, [admin, reload]);

  return admin ? (data?.newCount ?? 0) : 0;
}

const PortalShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { me, signOut } = usePortal();
  const pathname = usePathname() ?? "/portal";
  // The welcome tour is a single focused page, with nowhere else to wander off to.
  const welcomePath = me.role === "admin" ? null : WELCOME_PATH[me.role];
  const touring = welcomePath !== null && pathname === welcomePath && me.onboardedAt === null;
  const items = touring ? [] : NAV[me.role];
  const home = touring && welcomePath ? welcomePath : ROLE_HOME[me.role];
  const newReports = useNewReports(me.role === "admin", pathname);

  const links = items.map((item) => {
    const active = isActive(item, pathname);
    const count = item.href === REPORTS_PAGE ? newReports : 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "inline-flex items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
          active
            ? "bg-accent/15 text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {item.label}
        {count > 0 ? (
          <>
            <span
              aria-hidden
              className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-medium tabular-nums text-accent-foreground"
            >
              {count > 99 ? "99+" : count}
            </span>
            <span className="sr-only">, {count} new</span>
          </>
        ) : null}
      </Link>
    );
  });

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background font-normal text-foreground">
        <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
            <Link href={home} className="flex shrink-0 items-center gap-3">
              <Image src={sepLogo} alt="Sigma Eta Pi" width={80} height={32} className="portal-logo h-8 w-auto" />
              <span className="leading-tight">
                <span className="block text-sm font-medium text-foreground">{PROGRAM_NAME}</span>
                <span className="block text-xs text-muted-foreground">
                  {PORTAL_LABEL[me.role]}
                </span>
              </span>
            </Link>

            {/* In the header row only on a wide screen. The admins' eight items do not fit beside
                the logo and the buttons any narrower, so below that they get a row of their own. */}
            <nav aria-label="Portal" className="ml-4 hidden items-center gap-1 xl:flex">
              {links}
            </nav>

            {/* Icons alone on a phone, so the header still fits beside the logo. */}
            {/* The name gives way first, so the buttons always stay on screen. */}
            <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="hidden min-w-0 max-w-[14rem] truncate text-sm text-muted-foreground sm:block">
                {me.displayName}
              </span>
              <ReportButton />
              <ThemeToggle />
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label="Sign out"
                title="Sign out"
                className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>

          {links.length > 0 ? (
            <nav
              aria-label="Portal"
              className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 xl:hidden print:hidden"
            >
              {links}
            </nav>
          ) : null}
        </header>

        {me.preview ? (
          <div
            role="status"
            className="border-b border-warning-border bg-warning-subtle text-warning-ink print:hidden"
          >
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6">
              <span>{PREVIEW_BANNER[me.preview.role]}</span>
              <Button variant="outline" size="sm" onClick={() => void signOut()}>
                Done previewing
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</div>
      </div>
    </ToastProvider>
  );
};

export default PortalShell;
