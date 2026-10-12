import { portalRoute } from "@/lib/portal/server/http";
import { getSubmission } from "@/lib/portal/server/pledge-service";

export const GET = portalRoute<{ formId: string }>({ role: "pledge" }, (context) =>
  getSubmission(context, context.params.formId),
);
