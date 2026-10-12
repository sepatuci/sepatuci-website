import { portalRoute } from "@/lib/portal/server/http";
import { endSession } from "@/lib/portal/server/pledge-service";

export const POST = portalRoute({ role: "any", alwaysAllowed: true }, (context) => endSession(context));
