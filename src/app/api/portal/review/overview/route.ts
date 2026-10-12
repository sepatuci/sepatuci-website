import { portalRoute } from "@/lib/portal/server/http";
import { getReviewOverview } from "@/lib/portal/server/review-service";

// Read-only, for active members. There is no route in this folder that changes anything.
export const GET = portalRoute({ role: "active" }, (context) => getReviewOverview(context));
