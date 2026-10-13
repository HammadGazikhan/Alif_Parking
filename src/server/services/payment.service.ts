import "server-only";
import { randomBytes } from "node:crypto";
import type { Payment, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { activeGateway, gatewayFor } from "@/server/payments";
import { applySuccessfulPayment } from "@/server/services/settlement";
import { markOverdueFees } from "@/server/services/parking-fee.service";
import { paginate, skipTake } from "@/server/services/pagination";
import { ConflictError, NotFoundError } from "@/server/errors";
import type { CurrentUser } from "@/server/auth/guards";
import type { PaymentListQuery } from "@/lib/validations/payment";
import { formatBillingPeriod } from "@/lib/dates";
import { PAYMENT_QR_TTL_MINUTES } from "@/lib/constants";
import { normalizeVehicleNumber } from "@/lib/vehicle";

const RECONCILE_AFTER_MS = 20_000;
const REUSE_MIN_REMAINING_MS = 90_000;

const paymentInclude = {
  parkingFee: {
    include: {
      user: { select: { id: true, name: true, email: true } },
      vehicle: { select: { id: true, number: true, category: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentWithFee = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

type Display = { qrImageUrl: string | null; upiUri: string | null };

function displayOf(payment: Payment): Display {
  const raw = payment.rawPayload as { display?: Display } | null;
  return { qrImageUrl: raw?.display?.qrImageUrl ?? null, upiUri: raw?.display?.upiUri ?? null };
}

/** Client-safe view of a payment. Never includes gateway secrets or raw payloads. */
export function toCheckoutView(payment: PaymentWithFee) {
  const fee = payment.parkingFee;
  const isOpen = payment.status === "PENDING" || payment.status === "CREATED";
  return {
    id: payment.id,
    status: payment.status,
    provider: payment.provider,
    amount: payment.amount,
    currency: payment.currency,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    paidAt: payment.paidAt?.toISOString() ?? null,
    transactionId: payment.paymentId,
    paymentMethod: payment.paymentMethod,
    failureReason: payment.failureReason,
    ...(isOpen ? displayOf(payment) : { qrImageUrl: null, upiUri: null }),
    fee: {
      id: fee.id,
      month: fee.month,
      year: fee.year,
      period: formatBillingPeriod(fee.month, fee.year),
      status: fee.status,
      vehicleNumber: fee.vehicle.number,
    },
  };
}

export type CheckoutView = ReturnType<typeof toCheckoutView>;

/**
 * Start (or resume) a payment for one of the signed-in employee's fees.
 * The amount is always the fee amount stored in the database.
 */
export async function createPaymentOrder(user: CurrentUser, feeId: string): Promise<CheckoutView> {
  const owned = await prisma.parkingFee.findFirst({ where: { id: feeId, userId: user.id }, select: { id: true, status: true, dueDate: true } });
  if (!owned) throw new NotFoundError("Parking fee");
  if (owned.status === "DUE" && owned.dueDate.getTime() < Date.now()) await markOverdueFees();

  const gateway = activeGateway();

  const paymentId = await prisma.$transaction(
    async (tx) => {
      // Serialize order creation per fee so concurrent clicks share one QR.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${feeId}))`;

      const fee = await tx.parkingFee.findUniqueOrThrow({
        where: { id: feeId },
        include: { vehicle: { select: { number: true } } },
      });
      if (fee.status === "PAID") throw new ConflictError("This parking fee has already been paid.");
      if (fee.status === "CANCELLED") throw new ConflictError("This parking fee has been cancelled.");

      const now = Date.now();
      const reusable = await tx.payment.findFirst({
        where: {
          parkingFeeId: fee.id,
          provider: gateway.id,
          status: { in: ["CREATED", "PENDING"] },
          amount: fee.amount,
          expiresAt: { gt: new Date(now + REUSE_MIN_REMAINING_MS) },
        },
        orderBy: { createdAt: "desc" },
      });
      if (reusable) return reusable.id;

      const stale = await tx.payment.findMany({
        where: { parkingFeeId: fee.id, status: { in: ["CREATED", "PENDING"] } },
      });
      for (const p of stale) {
        await gatewayFor(p.provider).closeCollectRequest({ orderId: p.orderId, qrCodeId: p.qrCodeId });
      }
      if (stale.length) {
        await tx.payment.updateMany({
          where: { id: { in: stale.map((p) => p.id) }, status: { in: ["CREATED", "PENDING"] } },
          data: { status: "FAILED", failureReason: "Superseded by a new payment request" },
        });
      }

      const reference = `pay_${randomBytes(10).toString("hex")}`;
      const expiresAt = new Date(now + PAYMENT_QR_TTL_MINUTES * 60_000);
      const period = formatBillingPeriod(fee.month, fee.year);
      const request = await gateway.createCollectRequest({
        reference,
        amount: fee.amount,
        currency: "INR",
        description: `Parking ${period} ${fee.vehicle.number}`,
        customerName: user.name,
        expiresAt,
        notes: { fee_id: fee.id, employee_email: user.email, period },
      });

      await tx.payment.create({
        data: {
          id: reference,
          parkingFeeId: fee.id,
          provider: gateway.id,
          orderId: request.orderId,
          qrCodeId: request.qrCodeId,
          amount: fee.amount,
          currency: "INR",
          status: "PENDING",
          expiresAt,
          rawPayload: {
            display: { qrImageUrl: request.qrImageUrl, upiUri: request.upiUri },
            gateway: request.raw as Prisma.InputJsonValue,
          },
        },
      });
      return reference;
    },
    { timeout: 20_000 },
  );

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude });
  return toCheckoutView(payment);
}

async function loadPaymentFor(user: CurrentUser, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      ...(user.role === "ADMIN" ? {} : { parkingFee: { userId: user.id } }),
    },
    include: paymentInclude,
  });
  if (!payment) throw new NotFoundError("Payment");
  return payment;
}

/**
 * Current payment status for polling. Pending payments are reconciled with
 * the gateway (server-to-server) when stale or expired, so a delayed webhook
 * never leaves an employee stuck. The client never decides the outcome.
 */
export async function getPaymentStatus(user: CurrentUser, paymentId: string): Promise<CheckoutView> {
  let payment = await loadPaymentFor(user, paymentId);
  const isOpen = payment.status === "PENDING" || payment.status === "CREATED";
  if (!isOpen) return toCheckoutView(payment);

  const now = Date.now();
  const expired = payment.expiresAt ? payment.expiresAt.getTime() < now : false;
  const stale = now - payment.updatedAt.getTime() > RECONCILE_AFTER_MS;

  if (expired || stale) {
    const gateway = gatewayFor(payment.provider);
    const success = await gateway
      .fetchSuccessfulPayment({ orderId: payment.orderId, qrCodeId: payment.qrCodeId })
      .catch((error: unknown) => {
        console.warn("[payments] reconciliation failed", error);
        return null;
      });

    if (success) {
      const outcome = await prisma.$transaction(async (tx) => {
        const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        return applySuccessfulPayment(tx, fresh, success, "reconciliation");
      });
      await outcome.dispatch?.();
    } else if (expired) {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: { in: ["CREATED", "PENDING"] } },
        data: { status: "FAILED", failureReason: "QR code expired before payment was received" },
      });
      await gateway.closeCollectRequest({ orderId: payment.orderId, qrCodeId: payment.qrCodeId });
    } else {
      await prisma.payment.update({ where: { id: payment.id }, data: { updatedAt: new Date() } });
    }
    payment = await loadPaymentFor(user, paymentId);
  }
  return toCheckoutView(payment);
}

export async function getReceipt(user: CurrentUser, paymentId: string) {
  const payment = await loadPaymentFor(user, paymentId);
  if (payment.status !== "SUCCESS") throw new NotFoundError("Receipt");
  return payment;
}

export async function listPayments(query: PaymentListQuery, scope: { userId?: string } = {}) {
  const search = query.search?.trim();
  const where: Prisma.PaymentWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(scope.userId ? { parkingFee: { userId: scope.userId } } : {}),
    ...(query.month || query.year
      ? {
          parkingFee: {
            ...(scope.userId ? { userId: scope.userId } : {}),
            ...(query.month ? { month: query.month } : {}),
            ...(query.year ? { year: query.year } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { paymentId: { contains: search, mode: "insensitive" } },
            { orderId: { contains: search, mode: "insensitive" } },
            { parkingFee: { user: { name: { contains: search, mode: "insensitive" } } } },
            { parkingFee: { user: { email: { contains: search, mode: "insensitive" } } } },
            { parkingFee: { vehicle: { number: { contains: normalizeVehicleNumber(search), mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: [{ createdAt: "desc" }],
      ...skipTake(query),
    }),
    prisma.payment.count({ where }),
  ]);
  return paginate(
    items.map(({ rawPayload: _raw, ...p }) => {
      void _raw;
      return p;
    }),
    total,
    query,
  );
}
