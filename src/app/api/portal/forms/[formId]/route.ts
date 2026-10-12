import { portalRoute } from "@/lib/portal/server/http";
import { getPledgeForm } from "@/lib/portal/server/pledge-service";

export const GET = portalRoute<{ formId: string }>({ role: "pledge" }, (context) =>
  getPledgeForm(context, context.params.formId),
);
