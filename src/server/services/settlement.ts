import "server-only";
import type { Payment } from "@/generated/prisma/client";
import type { Db } from "@/server/db";
import type { GatewaySuccess } from "@/server/payments/types";
import { logAudit } from "@/server/services/audit.service";
import { messages, notify } from "@/server/services/notification.service";
import { formatINR } from "@/lib/money";
import { formatBillingPeriod } from "@/lib/dates";

export type SettlementResult = {
  result: "settled" | "already_processed" | "amount_mismatch" | "refund_required";
  dispatch?: () => Promise<void>;
};

/**
 * The single place where a payment becomes SUCCESS and a fee becomes PAID.
 * Only ever invoked with gateway-verified data (signed webhook or
 * authenticated server-to-server reconciliation). Must run inside a
 * transaction; every write is conditional so replays are no-ops.
 */
export async function applySuccessfulPayment(
  tx: Db,
  payment: Payment,
  success: GatewaySuccess,
  source: "webhook" | "reconciliation",
): Promise<SettlementResult> {
  if (payment.status === "SUCCESS") return { result: "already_processed" };

  const fee = await tx.parkingFee.findUniqueOrThrow({
    where: { id: payment.parkingFeeId },
    include: { user: { select: { name: true } } },
  });
  const period = formatBillingPeriod(fee.month, fee.year);

  if (success.amount !== payment.amount || success.currency !== payment.currency) {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        paymentId: success.gatewayPaymentId,
        failureReason: `Amount mismatch: expected ${formatINR(payment.amount)}, received ${formatINR(success.amount)} ${success.currency}`,
      },
    });
    await logAudit(
      {
        actorId: null,
        action: "PAYMENT_STATUS_CHANGED",
        entityType: "Payment",
        entityId: payment.id,
        description: `Rejected ${period} payment for ${fee.user.name}: amount mismatch`,
        metadata: { expected: payment.amount, received: success.amount, source },
      },
      tx,
    );
    return { result: "amount_mismatch" };
  }

  if (fee.status === "PAID" || fee.status === "CANCELLED") {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        paymentId: success.gatewayPaymentId,
        paidAt: success.paidAt,
        failureReason: `Funds received after the fee was ${fee.status.toLowerCase()} — refund required`,
      },
    });
    await logAudit(
      {
        actorId: null,
        action: "PAYMENT_STATUS_CHANGED",
        entityType: "Payment",
        entityId: payment.id,
        description: `Duplicate ${period} payment from ${fee.user.name} flagged for refund`,
        metadata: { gatewayPaymentId: success.gatewayPaymentId, source },
      },
      tx,
    );
    return { result: "refund_required" };
  }

  const updated = await tx.payment.updateMany({
    where: { id: payment.id, status: { in: ["CREATED", "PENDING", "FAILED"] } },
    data: {
      status: "SUCCESS",
      paymentId: success.gatewayPaymentId,
      paymentMethod: success.method,
      vpa: success.vpa,
      paidAt: success.paidAt,
      failureReason: null,
    },
  });
  if (updated.count === 0) return { result: "already_processed" };

  await tx.parkingFee.updateMany({
    where: { id: fee.id, status: { in: ["DUE", "OVERDUE"] } },
    data: { status: "PAID", paidAt: success.paidAt },
  });

  const dispatch = await notify(messages.paymentSuccess(fee, payment.id), tx);
  await logAudit(
    {
      actorId: null,
      action: "PAYMENT_STATUS_CHANGED",
      entityType: "Payment",
      entityId: payment.id,
      description: `Received ${formatINR(payment.amount)} from ${fee.user.name} for ${period} (txn ${success.gatewayPaymentId})`,
      metadata: { from: payment.status, to: "SUCCESS", source, gatewayPaymentId: success.gatewayPaymentId },
    },
    tx,
  );
  return { result: "settled", dispatch };
}
