import { deleteTeam, updateTeam } from "@/lib/portal/server/admin-teams-service";
import { portalRoute } from "@/lib/portal/server/http";

type Params = { teamId: string };

export const PATCH = portalRoute<Params>({ role: "admin" }, (context) =>
  updateTeam(context, context.params.teamId, context.body),
);

export const DELETE = portalRoute<Params>({ role: "admin" }, (context) =>
  deleteTeam(context, context.params.teamId),
);
