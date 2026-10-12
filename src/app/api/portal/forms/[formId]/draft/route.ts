import { LIMITS } from "@/lib/portal/constants";
import { portalRoute } from "@/lib/portal/server/http";
import { saveDraft } from "@/lib/portal/server/pledge-service";

export const PUT = portalRoute<{ formId: string }>(
  { role: "pledge", maxBodyBytes: LIMITS.answersBodyBytes },
  (context) => saveDraft(context, context.params.formId, context.body),
);
