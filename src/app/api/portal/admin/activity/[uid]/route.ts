import { getPersonActivity } from "@/lib/portal/server/activity-service";
import { portalRoute } from "@/lib/portal/server/http";

export const GET = portalRoute<{ uid: string }>({ role: "admin" }, (context) =>
  getPersonActivity(context, context.params.uid),
);
