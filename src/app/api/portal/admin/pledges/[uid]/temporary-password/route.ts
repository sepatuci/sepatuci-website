import { issuePledgeTemporaryPassword } from "@/lib/portal/server/admin-pledges-service";
import { portalRoute } from "@/lib/portal/server/http";

export const POST = portalRoute<{ uid: string }>({ role: "admin" }, (context) =>
  issuePledgeTemporaryPassword(context, context.params.uid),
);
