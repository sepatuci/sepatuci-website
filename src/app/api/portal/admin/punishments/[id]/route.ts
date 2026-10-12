import { deletePunishment, updatePunishment } from "@/lib/portal/server/admin-pledges-service";
import { portalRoute } from "@/lib/portal/server/http";

type Params = { id: string };

export const PATCH = portalRoute<Params>({ role: "admin" }, (context) =>
  updatePunishment(context, context.params.id, context.body),
);

export const DELETE = portalRoute<Params>({ role: "admin" }, (context) =>
  deletePunishment(context, context.params.id),
);
