import { createActive, listActives } from "@/lib/portal/server/admin-actives-service";
import { portalRoute } from "@/lib/portal/server/http";

export const GET = portalRoute({ role: "admin" }, (context) => listActives(context));

export const POST = portalRoute({ role: "admin" }, (context) =>
  createActive(context, context.body, new URL(context.request.url).origin),
);
