import { resetPledgeMfa } from "@/lib/portal/server/admin-pledges-service";
import { portalRoute } from "@/lib/portal/server/http";

export const POST = portalRoute<{ uid: string }>({ role: "admin" }, (context) =>
  resetPledgeMfa(context, context.params.uid),
);
