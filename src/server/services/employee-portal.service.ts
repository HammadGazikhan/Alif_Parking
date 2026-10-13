import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { paginate, skipTake } from "@/server/services/pagination";
import { currentPeriod } from "@/lib/dates";

/** Every query here is scoped by the session user's id — never by client input. */

const feeInclude = {
  vehicle: { select: { id: true, number: true, category: { select: { id: true, name: true } } } },
  payments: {
    where: { status: "SUCCESS" },
    select: { id: true, paymentId: true, paidAt: true, paymentMethod: true },
    take: 1,
  },
} satisfies Prisma.ParkingFeeInclude;

export type EmployeeFee = Prisma.ParkingFeeGetPayload<{ include: typeof feeInclude }>;

export async function getEmployeeOverview(userId: string) {
  const period = currentPeriod();
  const yearStart = { year: period.year };
  const [vehicles, unpaid, currentFees, recent, paidThisYear] = await Promise.all([
    prisma.vehicle.findMany({
      where: { userId, status: "ACTIVE" },
      include: { category: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.parkingFee.findMany({
      where: { userId, status: { in: ["DUE", "OVERDUE"] } },
      include: feeInclude,
      orderBy: [{ dueDate: "asc" }],
    }),
    prisma.parkingFee.findMany({
      where: { userId, month: period.month, year: period.year, status: { not: "CANCELLED" } },
      include: feeInclude,
      orderBy: { createdAt: "asc" },
    }),
    prisma.parkingFee.findMany({
      where: { userId, status: "PAID" },
      include: feeInclude,
      orderBy: [{ paidAt: "desc" }],
      take: 4,
    }),
    prisma.parkingFee.aggregate({
      where: { userId, status: "PAID", ...yearStart },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  return {
    period,
    vehicles,
    unpaid,
    currentFees,
    recent,
    paidThisYear: paidThisYear._sum.amount ?? 0,
    paidCountThisYear: paidThisYear._count._all,
    outstanding: unpaid.reduce((s, f) => s + f.amount, 0),
  };
}

export async function getOwnFee(userId: string, feeId: string) {
  return prisma.parkingFee.findFirst({ where: { id: feeId, userId }, include: feeInclude });
}

export async function listOwnFees(userId: string, page: number, pageSize = 10) {
  const where: Prisma.ParkingFeeWhereInput = { userId, status: { not: "CANCELLED" } };
  const [items, total, totals] = await Promise.all([
    prisma.parkingFee.findMany({
      where,
      include: feeInclude,
      orderBy: [{ year: "desc" }, { month: "desc" }],
      ...skipTake({ page, pageSize }),
    }),
    prisma.parkingFee.count({ where }),
    prisma.parkingFee.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const summary = { paid: 0, paidCount: 0, outstanding: 0, outstandingCount: 0 };
  for (const t of totals) {
    if (t.status === "PAID") {
      summary.paid += t._sum.amount ?? 0;
      summary.paidCount += t._count._all;
    } else if (t.status === "DUE" || t.status === "OVERDUE") {
      summary.outstanding += t._sum.amount ?? 0;
      summary.outstandingCount += t._count._all;
    }
  }
  return { ...paginate(items, total, { page, pageSize }), summary };
}

export async function getOwnProfile(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      designation: true,
      avatarType: true,
      parkingEligible: true,
      freePass: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      vehicles: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        include: { category: { select: { name: true } } },
      },
    },
  });
}
