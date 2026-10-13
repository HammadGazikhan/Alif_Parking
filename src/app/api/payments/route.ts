import { requireApiUser } from "@/server/auth/guards";
import { ok, parseQuery, route } from "@/server/http";
import { listPayments } from "@/server/services/payment.service";
import { paymentListQuerySchema } from "@/lib/validations/payment";

/** Admins see all payments; employees only ever see their own. */
export const GET = route(async (req) => {
  const user = await requireApiUser();
  const query = parseQuery(req, paymentListQuerySchema);
  return ok(await listPayments(query, user.role === "ADMIN" ? {} : { userId: user.id }));
});
