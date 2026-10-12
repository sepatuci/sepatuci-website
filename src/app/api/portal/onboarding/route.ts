import { portalRoute } from "@/lib/portal/server/http";
import { completeOnboarding } from "@/lib/portal/server/pledge-service";

// Pledges and actives each finish a welcome once. Admins have none.
export const POST = portalRoute({ role: "any" }, (context) => completeOnboarding(context));
