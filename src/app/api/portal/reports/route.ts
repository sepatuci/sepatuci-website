import { portalRoute } from "@/lib/portal/server/http";
import { submitReport } from "@/lib/portal/server/report-service";

export const POST = portalRoute({ role: "any" }, (context) => submitReport(context, context.body));
