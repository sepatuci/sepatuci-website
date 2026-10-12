import { createTeam } from "@/lib/portal/server/admin-teams-service";
import { portalRoute } from "@/lib/portal/server/http";

export const POST = portalRoute({ role: "admin" }, (context) => createTeam(context, context.body));
