import { portalRoute } from "@/lib/portal/server/http";
import { getPreviewState, removePreview, startPreview } from "@/lib/portal/server/preview-service";

export const GET = portalRoute({ role: "admin" }, (context) => getPreviewState(context));

export const POST = portalRoute({ role: "admin" }, (context) => startPreview(context, context.body));

export const DELETE = portalRoute({ role: "admin" }, (context) => removePreview(context));
