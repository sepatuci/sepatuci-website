"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Sign-in and portal pages are never reported to analytics. Their addresses can
 * carry one-time password-reset codes, and what members do inside the portal is
 * not marketing data.
 */
function isPrivate(url: string): boolean {
  try {
    const { pathname } = new URL(url, "https://sepatuci.com");
    return /^\/(login|portal)(\/|$)/.test(pathname);
  } catch {
    return true;
  }
}

const AnalyticsClient: React.FC = () => (
  <>
    <Analytics beforeSend={(event) => (isPrivate(event.url) ? null : event)} />
    <SpeedInsights beforeSend={(event) => (isPrivate(event.url) ? null : event)} />
  </>
);

export default AnalyticsClient;
