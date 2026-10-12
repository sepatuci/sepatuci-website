import { createActiveInviteLink } from "@/lib/portal/server/admin-actives-service";
import { portalRoute } from "@/lib/portal/server/http";

export const POST = portalRoute<{ uid: string }>({ role: "admin" }, (context) =>
  createActiveInviteLink(context, context.params.uid, new URL(context.request.url).origin),
);
