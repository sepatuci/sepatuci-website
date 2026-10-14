import { portalRoute } from "@/lib/portal/server/http";
import { countNewReports } from "@/lib/portal/server/report-service";

export const GET = portalRoute({ role: "admin" }, (context) => countNewReports(context));
