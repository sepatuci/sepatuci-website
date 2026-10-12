import { issueActiveTemporaryPassword } from "@/lib/portal/server/admin-actives-service";
import { portalRoute } from "@/lib/portal/server/http";

export const POST = portalRoute<{ uid: string }>({ role: "admin" }, (context) =>
  issueActiveTemporaryPassword(context, context.params.uid),
);
