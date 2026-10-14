import { portalRoute } from "@/lib/portal/server/http";
import { setReportStatus } from "@/lib/portal/server/report-service";

type Params = { reportId: string };

export const PATCH = portalRoute<Params>({ role: "admin" }, (context) =>
  setReportStatus(context, context.params.reportId, context.body),
);
