import { deleteResponse } from "@/lib/portal/server/admin-forms-service";
import { portalRoute } from "@/lib/portal/server/http";

export const DELETE = portalRoute<{ formId: string; uid: string }>({ role: "admin" }, (context) =>
  deleteResponse(context, context.params.formId, context.params.uid),
);
