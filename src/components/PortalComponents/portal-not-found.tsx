"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ROLE_HOME } from "@/lib/portal/roles";
import { usePortal } from "./portal-session";
import { EmptyState } from "./primitives";

/** Shown for any portal address that does not exist, with a way back to where the person belongs. */
const PortalNotFound: React.FC = () => {
  const { me } = usePortal();
  return (
    <EmptyState
      title="That page isn't here"
      body="The link may be old, or it may have been mistyped."
      action={
        <Button asChild variant="accent">
          <Link href={ROLE_HOME[me.role]}>Back to the portal</Link>
        </Button>
      }
    />
  );
};

export default PortalNotFound;
