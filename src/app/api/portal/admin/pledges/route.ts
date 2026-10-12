import { createPledge, getOverview } from "@/lib/portal/server/admin-pledges-service";
import { portalRoute } from "@/lib/portal/server/http";

export const GET = portalRoute({ role: "admin" }, (context) => getOverview(context));

export const POST = portalRoute({ role: "admin" }, (context) =>
  createPledge(context, context.body, new URL(context.request.url).origin),
);
