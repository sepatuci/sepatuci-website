import { createInviteLink } from "@/lib/portal/server/admin-pledges-service";
import { portalRoute } from "@/lib/portal/server/http";

export const POST = portalRoute<{ uid: string }>({ role: "admin" }, (context) =>
  createInviteLink(context, context.params.uid, new URL(context.request.url).origin),
);
