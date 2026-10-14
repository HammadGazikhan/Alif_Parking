import "server-only";
import type { Payment, PaymentProvider } from "@/generated/prisma/client";
import { prisma, type Db } from "@/server/db";
import { gatewayForWebhook } from "@/server/payments";
import type { GatewaySuccess, ParsedWebhookEvent } from "@/server/payments/types";
import { applySuccessfulPayment } from "@/server/services/settlement";
import { messages, notify } from "@/server/services/notification.service";
import { isUniqueConstraintError } from "@/server/errors";

export type WebhookResponse = { status: number; body: Record<string, unknown> };

const OUR_PAYMENT_REF = /^pay_[0-9a-f]{20}$/;

async function findPayment(tx: Db, provider: PaymentProvider, ref: ParsedWebhookEvent["reference"]) {
  const or = [
    ref.qrCodeId ? { qrCodeId: ref.qrCodeId } : null,
    ref.orderId ? { orderId: ref.orderId } : null,
    ref.paymentRef ? { id: ref.paymentRef } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  if (!or.length) return null;
  return tx.payment.findFirst({ where: { provider, OR: or } });
}

/**
 * A verified capture whose local row was deleted or never stored.
 * The captured amount is stored as-is, so a later edit of the bill cannot reject it.
 * Free-pass bills are left untouched.
 */
async function recoverCapturedPayment(
  tx: Db,
  provider: PaymentProvider,
  ref: ParsedWebhookEvent["reference"],
  success: GatewaySuccess,
): Promise<Payment | null> {
  if (!ref.feeId) return null;
  const already = await tx.payment.findUnique({ where: { paymentId: success.gatewayPaymentId } });
  if (already) return already.provider === provider ? already : null;

  const fee = await tx.parkingFee.findUnique({
    where: { id: ref.feeId },
    include: { user: { select: { freePass: true } } },
  });
  if (!fee || fee.user.freePass) return null;
  if (fee.status === "CANCELLED") return null;

  const preferredId = ref.paymentRef && OUR_PAYMENT_REF.test(ref.paymentRef) ? ref.paymentRef : null;
  if (preferredId) {
    const existing = await tx.payment.findUnique({ where: { id: preferredId } });
    if (existing) return existing.provider === provider ? existing : null;
  }

  const orderId = ref.orderId?.startsWith("order_") ? ref.orderId : `recovered_${success.gatewayPaymentId}`;
  const orderTaken = await tx.payment.findUnique({ where: { orderId } });
  if (orderTaken) return orderTaken.provider === provider ? orderTaken : null;

  const qrCodeId = ref.qrCodeId?.startsWith("qr_") ? ref.qrCodeId : null;
  if (qrCodeId) {
    const qrTaken = await tx.payment.findUnique({ where: { qrCodeId } });
    if (qrTaken) return qrTaken.provider === provider ? qrTaken : null;
  }

  return tx.payment.create({
    data: {
      id: preferredId ?? `recovered_${success.gatewayPaymentId}`,
      parkingFeeId: fee.id,
      provider,
      orderId,
      qrCodeId,
      amount: success.amount,
      currency: success.currency || "INR",
      status: "PENDING",
    },
  });
}

async function paymentForEvent(tx: Db, provider: PaymentProvider, event: ParsedWebhookEvent) {
  const found = await findPayment(tx, provider, event.reference);
  if (found) return found;
  if (event.outcome !== "success" || !event.success) return null;
  return recoverCapturedPayment(tx, provider, event.reference, event.success);
}

async function handleEvent(tx: Db, provider: PaymentProvider, event: ParsedWebhookEvent) {
  if (event.outcome === "ignored") return { result: "ignored" };

  const payment = await paymentForEvent(tx, provider, event);
  if (!payment) return { result: "unmatched" };

  if (event.outcome === "success" && event.success) {
    return applySuccessfulPayment(tx, payment, event.success, "webhook");
  }

  // failed
  const res = await tx.payment.updateMany({
    where: { id: payment.id, status: { in: ["CREATED", "PENDING"] } },
    data: { status: "FAILED", failureReason: event.failureReason ?? "Payment failed" },
  });
  if (res.count === 0) return { result: "already_processed" };
  const fee = await tx.parkingFee.findUniqueOrThrow({ where: { id: payment.parkingFeeId } });
  const dispatch = await notify(messages.paymentFailed(fee), tx);
  return { result: "failed", dispatch };
}

/** Record a captured Razorpay payment identified by the notes we stored on it. */
export async function settleCapturedNotes(input: {
  feeId: string;
  paymentRef?: string;
  orderId?: string;
  qrCodeId?: string;
  success: GatewaySuccess;
}): Promise<string> {
  const event: ParsedWebhookEvent = {
    eventId: input.success.gatewayPaymentId,
    type: "payment.captured",
    outcome: "success",
    reference: {
      feeId: input.feeId,
      paymentRef: input.paymentRef,
      orderId: input.orderId,
      qrCodeId: input.qrCodeId,
    },
    success: input.success,
    gatewayPaymentId: input.success.gatewayPaymentId,
  };
  const outcome = await prisma.$transaction(async (tx) => handleEvent(tx, "RAZORPAY", event));
  if ("dispatch" in outcome && outcome.dispatch) await outcome.dispatch();
  return outcome.result;
}

/**
 * Verify and process a gateway webhook exactly once.
 *
 * The WebhookEvent insert (unique on eventId) and all resulting state changes
 * share one transaction: a concurrent or replayed delivery either blocks on
 * the row lock and then hits the unique constraint (=> duplicate), or the
 * first attempt rolled back and this one processes it.
 */
export async function processWebhook(rawBody: string, headers: Headers): Promise<WebhookResponse> {
  const gateway = gatewayForWebhook(headers);
  if (!gateway || !gateway.verifyWebhookSignature(rawBody, headers)) {
    return { status: 401, body: { error: "Invalid signature" } };
  }

  let event: ParsedWebhookEvent;
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
    event = gateway.parseWebhookEvent(rawBody, headers);
  } catch {
    return { status: 400, body: { error: "Malformed payload" } };
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({
        data: {
          eventId: event.eventId,
          provider: gateway.id,
          type: event.type,
          payload: payload as object,
        },
      });
      const handled = await handleEvent(tx, gateway.id, event);
      await tx.webhookEvent.update({
        where: { eventId: event.eventId },
        data: { processedAt: new Date(), result: handled.result },
      });
      return handled;
    });
    if ("dispatch" in outcome && outcome.dispatch) await outcome.dispatch();
    return { status: 200, body: { received: true, result: outcome.result } };
  } catch (error) {
    // Only a clash on the event id means "already delivered". Any other unique
    // violation (e.g. a second SUCCESS payment for the same fee racing this
    // one) must be retried so it is re-evaluated and flagged for refund.
    if (isUniqueConstraintError(error)) {
      const seen = await prisma.webhookEvent.findUnique({ where: { eventId: event.eventId }, select: { id: true } });
      if (seen) return { status: 200, body: { received: true, result: "duplicate" } };
    }
    console.error("[webhook] processing failed", error);
    // Non-2xx so the gateway retries delivery.
    return { status: 500, body: { error: "Processing failed" } };
  }
}
