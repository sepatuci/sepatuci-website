"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { isThemedPath, THEME_ATTRIBUTE } from "@/lib/portal/theme";

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface HideOnPortalProps {
  children: React.ReactNode;
}

/**
 * The sign-in pages and the portal have their own header and their own light
 * and dark mode, so the public site's navigation and footer step aside there.
 */
const HideOnPortal: React.FC<HideOnPortalProps> = ({ children }) => {
  const pathname = usePathname();
  // The public site has one look. If a sign-in or portal theme is still on the
  // page after navigating back here, it comes off before anything is painted.
  useBrowserLayoutEffect(() => {
    if (pathname && !isThemedPath(pathname)) {
      document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    }
  }, [pathname]);
  if (pathname && isThemedPath(pathname)) return null;
  return <>{children}</>;
};

export default HideOnPortal;
