import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/PortalAuthComponents/auth-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

// Catches any sign-in address with no page of its own, so it gets the same
// frame and theme as the sign-in pages and not the public site's.
export default function LoginCatchAllPage() {
  return (
    <AuthShell>
      <h2 className="text-xl font-medium text-foreground">That page isn&apos;t here</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The link may be old, or it may have been mistyped.
      </p>
      <Link href="/login" className="mt-6 block">
        <Button variant="accent" className="h-11 w-full">
          Go to sign in
        </Button>
      </Link>
    </AuthShell>
  );
}
