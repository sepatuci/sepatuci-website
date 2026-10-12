import { removeActive, updateActive } from "@/lib/portal/server/admin-actives-service";
import { portalRoute } from "@/lib/portal/server/http";

type Params = { uid: string };

export const PATCH = portalRoute<Params>({ role: "admin" }, (context) =>
  updateActive(context, context.params.uid, context.body),
);

export const DELETE = portalRoute<Params>({ role: "admin" }, (context) =>
  removeActive(
    context,
    context.params.uid,
    new URL(context.request.url).searchParams.get("confirm"),
  ),
);
