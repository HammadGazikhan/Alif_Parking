import { z } from "zod";
import { requireApiEmployee } from "@/server/auth/guards";
import { isMockPaymentsEnabled } from "@/server/env";
import { prisma } from "@/server/db";
import { ok, parseJson, route } from "@/server/http";
import { buildMockWebhook } from "@/server/payments/mock";
import { processWebhook } from "@/server/services/webhook.service";
import { AppError, NotFoundError } from "@/server/errors";

const schema = z.object({
  paymentId: z.string().min(1),
  outcome: z.enum(["success", "failed"]).default("success"),
});

/**
 * Development only: plays the role of the payer's UPI app + gateway. It
 * builds a gateway-signed event and feeds it through the exact webhook
 * handler (including signature verification) used in production.
 */
export const POST = route(async (req) => {
  if (!isMockPaymentsEnabled()) throw new AppError(404, "NOT_FOUND", "Not found.");
  const user = await requireApiEmployee();
  const { paymentId, outcome } = await parseJson(req, schema);

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, provider: "MOCK", parkingFee: { userId: user.id } },
  });
  if (!payment || !payment.qrCodeId) throw new NotFoundError("Payment");

  const event = buildMockWebhook({
    qrCodeId: payment.qrCodeId,
    amount: payment.amount,
    outcome,
    paymentRef: payment.id,
  });
  const result = await processWebhook(event.body, event.headers);
  return ok({ webhook: result.body, status: result.status });
});
