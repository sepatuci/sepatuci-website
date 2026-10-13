import { listActivity } from "@/lib/portal/server/activity-service";
import { portalRoute } from "@/lib/portal/server/http";

export const GET = portalRoute({ role: "admin" }, (context) => listActivity(context));
