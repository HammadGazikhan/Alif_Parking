import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { logAudit } from "@/server/services/audit.service";
import { messages, notify } from "@/server/services/notification.service";
import { getSettings } from "@/server/services/settings.service";
import { paginate, skipTake } from "@/server/services/pagination";
import { ConflictError, NotFoundError } from "@/server/errors";
import type { CurrentUser } from "@/server/auth/guards";
import type { ParkingFeeListQuery, ParkingFeeUpdateInput } from "@/lib/validations/parking";
import { formatBillingPeriod } from "@/lib/dates";
import { normalizeVehicleNumber } from "@/lib/vehicle";

export const feeListInclude = {
  user: { select: { id: true, name: true, email: true } },
  vehicle: { select: { id: true, number: true, category: { select: { id: true, name: true } } } },
  payments: {
    where: { status: "SUCCESS" },
    select: { id: true, paymentId: true, paidAt: true, paymentMethod: true },
    take: 1,
  },
} satisfies Prisma.ParkingFeeInclude;

export type FeeListItem = Prisma.ParkingFeeGetPayload<{ include: typeof feeListInclude }>;

export function buildFeeWhere(query: Partial<ParkingFeeListQuery>): Prisma.ParkingFeeWhereInput {
  const search = query.search?.trim();
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.month ? { month: query.month } : {}),
    ...(query.year ? { year: query.year } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
    ...(search
      ? {
          OR: [
            { user: { name: { contains: search, mode: "insensitive" } } },
            { user: { email: { contains: search, mode: "insensitive" } } },
            { vehicle: { number: { contains: normalizeVehicleNumber(search), mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listParkingFees(query: ParkingFeeListQuery) {
  const where = buildFeeWhere(query);
  const [items, total, statusCounts] = await Promise.all([
    prisma.parkingFee.findMany({
      where,
      include: feeListInclude,
      orderBy: [{ year: "desc" }, { month: "desc" }, { status: "asc" }, { user: { name: "asc" } }],
      ...skipTake(query),
    }),
    prisma.parkingFee.count({ where }),
    prisma.parkingFee.groupBy({
      by: ["status"],
      where: buildFeeWhere({ ...query, status: undefined }),
      _count: { _all: true },
    }),
  ]);
  const counts = { ALL: 0, DUE: 0, PAID: 0, OVERDUE: 0, CANCELLED: 0 };
  for (const row of statusCounts) {
    counts[row.status] = row._count._all;
    counts.ALL += row._count._all;
  }
  return { ...paginate(items, total, query), counts };
}

export async function updateParkingFee(actor: CurrentUser, id: string, input: ParkingFeeUpdateInput) {
  const fee = await prisma.parkingFee.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!fee) throw new NotFoundError("Parking fee");
  const period = formatBillingPeriod(fee.month, fee.year);

  return prisma.$transaction(async (tx) => {
    if (input.action === "cancel") {
      // Conditional update: a fee can only be cancelled while unpaid.
      const res = await tx.parkingFee.updateMany({
        where: { id, status: { in: ["DUE", "OVERDUE"] } },
        data: { status: "CANCELLED", notes: input.reason ?? fee.notes },
      });
      if (res.count === 0) throw new ConflictError("Only unpaid fees can be cancelled.");
      await tx.payment.updateMany({
        where: { parkingFeeId: id, status: { in: ["CREATED", "PENDING"] } },
        data: { status: "FAILED", failureReason: "Fee cancelled by administrator" },
      });
      await logAudit(
        {
          actorId: actor.id,
          action: "FEE_CANCELLED",
          entityType: "ParkingFee",
          entityId: id,
          description: `Cancelled ${period} fee for ${fee.user.name}${input.reason ? ` (${input.reason})` : ""}`,
        },
        tx,
      );
    } else if (input.action === "reopen") {
      const status = fee.dueDate.getTime() < Date.now() ? "OVERDUE" : "DUE";
      const res = await tx.parkingFee.updateMany({
        where: { id, status: "CANCELLED" },
        data: { status },
      });
      if (res.count === 0) throw new ConflictError("Only cancelled fees can be reopened.");
      await logAudit(
        {
          actorId: actor.id,
          action: "FEE_UPDATED",
          entityType: "ParkingFee",
          entityId: id,
          description: `Reopened ${period} fee for ${fee.user.name}`,
        },
        tx,
      );
    } else {
      await tx.parkingFee.update({ where: { id }, data: { notes: input.notes || null } });
      await logAudit(
        {
          actorId: actor.id,
          action: "FEE_UPDATED",
          entityType: "ParkingFee",
          entityId: id,
          description: `Updated notes on ${period} fee for ${fee.user.name}`,
        },
        tx,
      );
    }
    return tx.parkingFee.findUniqueOrThrow({ where: { id }, include: feeListInclude });
  });
}

export async function sendFeeReminder(actor: CurrentUser, id: string) {
  const fee = await prisma.parkingFee.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!fee) throw new NotFoundError("Parking fee");
  if (fee.status !== "DUE" && fee.status !== "OVERDUE") {
    throw new ConflictError("Reminders can only be sent for unpaid fees.");
  }
  const dispatch = await prisma.$transaction(async (tx) => {
    const send = await notify(fee.status === "OVERDUE" ? messages.feeOverdue(fee) : messages.feeDue(fee), tx);
    await logAudit(
      {
        actorId: actor.id,
        action: "REMINDER_SENT",
        entityType: "ParkingFee",
        entityId: id,
        description: `Sent ${formatBillingPeriod(fee.month, fee.year)} payment reminder to ${fee.user.name}`,
      },
      tx,
    );
    return send;
  });
  await dispatch();
}

/**
 * Move unpaid fees past their due date to OVERDUE and apply the configured
 * late fee. Safe to run repeatedly: the conditional update only touches fees
 * that are still DUE.
 */
export async function markOverdueFees(now: Date = new Date(), actorId: string | null = null) {
  const settings = await getSettings();
  const candidates = await prisma.parkingFee.findMany({
    where: { status: "DUE", dueDate: { lt: now } },
    select: { id: true },
  });
  if (!candidates.length) return { updated: 0 };

  const dispatchers: Array<() => Promise<void>> = [];
  let updated = 0;
  for (const { id } of candidates) {
    await prisma.$transaction(async (tx) => {
      const fee = await tx.parkingFee.findUnique({ where: { id } });
      if (!fee || fee.status !== "DUE") return;
      const lateFee = settings.lateFee;
      const res = await tx.parkingFee.updateMany({
        where: { id, status: "DUE" },
        data: { status: "OVERDUE", lateFee, amount: fee.baseAmount + lateFee },
      });
      if (res.count === 0) return;
      updated++;
      dispatchers.push(await notify(messages.feeOverdue({ ...fee, amount: fee.baseAmount + lateFee }), tx));
    });
  }

  if (updated > 0) {
    await logAudit({
      actorId,
      action: "FEES_MARKED_OVERDUE",
      entityType: "ParkingFee",
      description: `Marked ${updated} fee${updated === 1 ? "" : "s"} as overdue`,
      metadata: { lateFee: settings.lateFee },
    });
  }
  await Promise.allSettled(dispatchers.map((d) => d()));
  return { updated };
}
