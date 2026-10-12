import { portalRoute } from "@/lib/portal/server/http";
import { listSubmissions } from "@/lib/portal/server/pledge-service";

export const GET = portalRoute({ role: "pledge" }, (context) => listSubmissions(context));
