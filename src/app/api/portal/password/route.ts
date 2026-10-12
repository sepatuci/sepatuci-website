import { portalRoute } from "@/lib/portal/server/http";
import { replaceTemporaryPassword } from "@/lib/portal/server/pledge-service";

// The one route an account on a temporary password can reach. It replaces that
// password with the person's own, and does nothing for any other account.
export const POST = portalRoute({ role: "any", passwordSetup: true }, (context) =>
  replaceTemporaryPassword(context, context.body),
);
