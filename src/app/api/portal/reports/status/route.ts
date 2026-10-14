import { portalRoute } from "@/lib/portal/server/http";
import { getReportStatus } from "@/lib/portal/server/report-service";

export const GET = portalRoute({ role: "any" }, (context) => getReportStatus(context));
