import { portalRoute } from "@/lib/portal/server/http";
import { listPeople } from "@/lib/portal/server/people-service";

export const GET = portalRoute({ role: "admin" }, (context) => listPeople(context));
