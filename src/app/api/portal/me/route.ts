import { portalRoute } from "@/lib/portal/server/http";
import { getMe } from "@/lib/portal/server/pledge-service";

export const GET = portalRoute({ role: "any" }, (context) => getMe(context));
