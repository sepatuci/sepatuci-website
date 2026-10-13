import { portalRoute } from "@/lib/portal/server/http";
import { recordHeartbeat } from "@/lib/portal/server/pledge-service";

export const POST = portalRoute({ role: "any" }, (context) =>
  recordHeartbeat(context, context.body, context.request.headers.get("user-agent")),
);
