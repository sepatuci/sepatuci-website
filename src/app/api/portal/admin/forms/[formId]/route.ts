import { LIMITS } from "@/lib/portal/constants";
import { deleteForm, getForm, saveForm } from "@/lib/portal/server/admin-forms-service";
import { portalRoute } from "@/lib/portal/server/http";

type Params = { formId: string };

export const GET = portalRoute<Params>({ role: "admin" }, (context) =>
  getForm(context, context.params.formId),
);

export const PUT = portalRoute<Params>(
  { role: "admin", maxBodyBytes: LIMITS.formBodyBytes },
  (context) => saveForm(context, context.params.formId, context.body),
);

export const DELETE = portalRoute<Params>({ role: "admin" }, (context) =>
  deleteForm(context, context.params.formId),
);
