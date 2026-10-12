import { portalRoute } from "@/lib/portal/server/http";
import { changeRole } from "@/lib/portal/server/people-service";

export const POST = portalRoute<{ uid: string }>({ role: "admin" }, (context) =>
  changeRole(context, context.params.uid, context.body),
);
