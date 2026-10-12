import { listAudit } from "@/lib/portal/server/audit";
import { portalRoute } from "@/lib/portal/server/http";

export const GET = portalRoute({ role: "admin" }, (context) =>
  listAudit(context.admin, new URL(context.request.url).searchParams.get("before")),
);
