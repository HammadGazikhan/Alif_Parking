import { requireApiUser } from "@/server/auth/guards";
import { ok, route } from "@/server/http";
import { getPaymentStatus } from "@/server/services/payment.service";

type Ctx = RouteContext<"/api/payments/[id]">;

/** Read-only status for polling. There is intentionally no client-side "mark paid" endpoint. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  return ok(await getPaymentStatus(user, id), { headers: { "Cache-Control": "no-store" } });
});
