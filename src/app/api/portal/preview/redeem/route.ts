import { publicRoute } from "@/lib/portal/server/http";
import { redeemPreview } from "@/lib/portal/server/preview-service";

// Open to anyone: the code in the link is the credential, and it works once.
export const POST = publicRoute({ limitKey: "preview-redeem" }, (context) =>
  redeemPreview(context.admin, context.body, context.now),
);
