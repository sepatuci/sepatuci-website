import { getResponses } from "@/lib/portal/server/admin-forms-service";
import { portalRoute } from "@/lib/portal/server/http";

export const GET = portalRoute<{ formId: string }>({ role: "admin" }, (context) =>
  getResponses(context, context.params.formId),
);
