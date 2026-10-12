import { LIMITS } from "@/lib/portal/constants";
import { portalRoute } from "@/lib/portal/server/http";
import { submitForm } from "@/lib/portal/server/pledge-service";

export const POST = portalRoute<{ formId: string }>(
  // Turning a deliverable in is never held back by the autosaves before it.
  { role: "pledge", maxBodyBytes: LIMITS.answersBodyBytes, countsAsWrite: false },
  (context) => submitForm(context, context.params.formId, context.body),
);
