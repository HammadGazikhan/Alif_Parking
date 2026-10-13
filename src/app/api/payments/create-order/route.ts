import { requireApiEmployee } from "@/server/auth/guards";
import { ok, parseJson, route } from "@/server/http";
import { createPaymentOrder } from "@/server/services/payment.service";
import { createOrderSchema } from "@/lib/validations/payment";

/**
 * Body: `{ feeId }` only. Amount, currency and payer are resolved from the
 * database and the session — any other fields sent by the client are ignored.
 */
export const POST = route(async (req) => {
  const user = await requireApiEmployee();
  const { feeId } = await parseJson(req, createOrderSchema);
  return ok(await createPaymentOrder(user, feeId), { status: 201 });
});
