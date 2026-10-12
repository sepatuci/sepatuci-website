import { portalRoute } from "@/lib/portal/server/http";
import { getReviewForm } from "@/lib/portal/server/review-service";

export const GET = portalRoute<{ formId: string }>({ role: "active" }, (context) =>
  getReviewForm(context, context.params.formId),
);
