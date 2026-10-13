import { z } from "zod";
import { requireApiAdmin } from "@/server/auth/guards";
import { AppError } from "@/server/errors";
import { ok, parseJson, route } from "@/server/http";
import { verifyRazorpayTestPayment } from "@/server/payments/razorpay-test";

const schema = z.object({
  orderId: z.string().startsWith("order_").max(100),
  paymentId: z.string().startsWith("pay_").max(100),
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const runtime = "nodejs";

export const POST = route(async (req) => {
  await requireApiAdmin();
  const { orderId, paymentId, signature } = await parseJson(req, schema);
  if (!verifyRazorpayTestPayment(orderId, paymentId, signature)) {
    throw new AppError(400, "INVALID_PAYMENT_SIGNATURE", "Razorpay could not verify this test payment.");
  }
  return ok({ verified: true, orderId, paymentId });
});
