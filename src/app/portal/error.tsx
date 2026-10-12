"use client";

import { Button } from "@/components/ui/button";

/** What a portal page shows if it fails to render, in place of a blank screen. */
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <p className="text-lg text-foreground">Something went wrong on this page</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Anything you saved is still there. Try again, and if it keeps happening tell a Founder&apos;s
        Education admin.
      </p>
      <Button variant="accent" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
