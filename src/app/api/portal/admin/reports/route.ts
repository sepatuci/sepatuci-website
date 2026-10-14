import { portalRoute } from "@/lib/portal/server/http";
import { listReports } from "@/lib/portal/server/report-service";

export const GET = portalRoute({ role: "admin" }, (context) =>
  listReports(context, new URL(context.request.url).searchParams.get("status")),
);
