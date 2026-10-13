import { getSessionDetail } from "@/lib/portal/server/activity-service";
import { portalRoute } from "@/lib/portal/server/http";

export const GET = portalRoute<{ uid: string; sessionId: string }>({ role: "admin" }, (context) =>
  getSessionDetail(context, context.params.uid, context.params.sessionId),
);
