import { createForm, listForms } from "@/lib/portal/server/admin-forms-service";
import { portalRoute } from "@/lib/portal/server/http";

export const GET = portalRoute({ role: "admin" }, (context) => listForms(context));

export const POST = portalRoute({ role: "admin" }, (context) => createForm(context, context.body));
