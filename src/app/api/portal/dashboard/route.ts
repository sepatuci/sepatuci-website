import { portalRoute } from "@/lib/portal/server/http";
import { getDashboard } from "@/lib/portal/server/pledge-service";

export const GET = portalRoute({ role: "pledge" }, (context) => getDashboard(context));
