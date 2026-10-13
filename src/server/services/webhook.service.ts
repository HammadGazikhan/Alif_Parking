import "server-only";
import type { PaymentProvider } from "@/generated/prisma/client";
import { prisma, type Db } from "@/server/db";
import { gatewayForWebhook } from "@/server/payments";
import type { ParsedWebhookEvent } from "@/server/payments/types";
import { applySuccessfulPayment } from "@/server/services/settlement";
import { messages, notify } from "@/server/services/notification.service";
import { isUniqueConstraintError } from "@/server/errors";

export type WebhookResponse = { status: number; body: Record<string, unknown> };

async function findPayment(tx: Db, provider: PaymentProvider, ref: ParsedWebhookEvent["reference"]) {
  const or = [
    ref.qrCodeId ? { qrCodeId: ref.qrCodeId } : null,
    ref.orderId ? { orderId: ref.orderId } : null,
    ref.paymentRef ? { id: ref.paymentRef } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  if (!or.length) return null;
  return tx.payment.findFirst({ where: { provider, OR: or } });
}

async function handleEvent(tx: Db, provider: PaymentProvider, event: ParsedWebhookEvent) {
  if (event.outcome === "ignored") return { result: "ignored" };

  const payment = await findPayment(tx, provider, event.reference);
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
