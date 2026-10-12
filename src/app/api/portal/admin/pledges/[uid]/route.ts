import {
  deletePledge,
  getPledgeDetail,
  updatePledge,
} from "@/lib/portal/server/admin-pledges-service";
import { portalRoute } from "@/lib/portal/server/http";

type Params = { uid: string };

export const GET = portalRoute<Params>({ role: "admin" }, (context) =>
  getPledgeDetail(context, context.params.uid),
);

export const PATCH = portalRoute<Params>({ role: "admin" }, (context) =>
  updatePledge(context, context.params.uid, context.body),
);

export const DELETE = portalRoute<Params>({ role: "admin" }, (context) =>
  deletePledge(
    context,
    context.params.uid,
    new URL(context.request.url).searchParams.get("confirm"),
  ),
);
