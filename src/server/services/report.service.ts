import "server-only";
import type { ParkingFeeStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { feeListInclude } from "@/server/services/parking-fee.service";
import type { ReportQuery } from "@/lib/validations/payment";
import { currentPeriod, daysOverdue, formatBillingPeriod, periodKey, shiftPeriod } from "@/lib/dates";

type Period = { month: number; year: number };

export type MonthlyCollectionRow = {
  month: number;
  year: number;
  label: string;
  shortLabel: string;
  expected: number;
  collected: number;
  outstanding: number;
  feeCount: number;
  paidCount: number;
};

function parsePeriod(value: string | undefined): Period | undefined {
  if (!value) return undefined;
  const [y, m] = value.split("-").map(Number);
  return y && m ? { year: y, month: m } : undefined;
}

export function resolveRange(query: Pick<ReportQuery, "from" | "to">, defaultMonths = 6) {
  const to = parsePeriod(query.to) ?? currentPeriod();
  const from = parsePeriod(query.from) ?? shiftPeriod(to, -(defaultMonths - 1));
  return periodKey(from) <= periodKey(to) ? { from, to } : { from: to, to: from };
}

function periodsBetween(from: Period, to: Period): Period[] {
  const out: Period[] = [];
  let p = from;
  while (periodKey(p) <= periodKey(to) && out.length < 120) {
    out.push(p);
    p = shiftPeriod(p, 1);
  }
  return out;
}

function rangeWhere(from: Period, to: Period): Prisma.ParkingFeeWhereInput {
  return {
    OR: periodsBetween(from, to).map((p) => ({ month: p.month, year: p.year })),
  };
}

export function buildReportWhere(query: ReportQuery): Prisma.ParkingFeeWhereInput {
  const { from, to } = resolveRange(query);
  return {
    AND: [
      rangeWhere(from, to),
      query.userId ? { userId: query.userId } : {},
      query.status ? { status: query.status } : {},
    ],
  };
}

export async function getMonthlyCollection(query: ReportQuery): Promise<MonthlyCollectionRow[]> {
  const { from, to } = resolveRange(query);
  const grouped = await prisma.parkingFee.groupBy({
    by: ["year", "month", "status"],
    where: buildReportWhere(query),
    _sum: { amount: true },
    _count: { _all: true },
  });

  const rows = new Map<number, MonthlyCollectionRow>();
  for (const p of periodsBetween(from, to)) {
    rows.set(periodKey(p), {
      ...p,
      label: formatBillingPeriod(p.month, p.year),
      shortLabel: formatBillingPeriod(p.month, p.year, true),
      expected: 0,
      collected: 0,
      outstanding: 0,
      feeCount: 0,
      paidCount: 0,
    });
  }
  for (const g of grouped) {
    const row = rows.get(periodKey(g));
    if (!row || g.status === "CANCELLED") continue;
    const sum = g._sum.amount ?? 0;
    row.expected += sum;
    row.feeCount += g._count._all;
    if (g.status === "PAID") {
      row.collected += sum;
      row.paidCount += g._count._all;
    } else {
      row.outstanding += sum;
    }
  }
  return [...rows.values()];
}

export async function getStatusBreakdown(period: Period = currentPeriod()) {
  const grouped = await prisma.parkingFee.groupBy({
    by: ["status"],
    where: { month: period.month, year: period.year },
    _count: { _all: true },
    _sum: { amount: true },
  });
  const base: Record<ParkingFeeStatus, { count: number; amount: number }> = {
    PAID: { count: 0, amount: 0 },
    DUE: { count: 0, amount: 0 },
    OVERDUE: { count: 0, amount: 0 },
    CANCELLED: { count: 0, amount: 0 },
  };
  for (const g of grouped) base[g.status] = { count: g._count._all, amount: g._sum.amount ?? 0 };
  return base;
}

export async function getDashboardStats(now: Date = new Date()) {
  const period = currentPeriod(now);
  const previous = shiftPeriod(period, -1);
  const [totalEmployees, activeVehicles, current, prev, outstanding, newEmployees] = await Promise.all([
    prisma.user.count({ where: { role: "EMPLOYEE", status: "ACTIVE" } }),
    prisma.vehicle.count({ where: { status: "ACTIVE", user: { status: "ACTIVE" } } }),
    getStatusBreakdown(period),
    getStatusBreakdown(previous),
    prisma.parkingFee.aggregate({
      where: { status: { in: ["DUE", "OVERDUE"] } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.user.count({
      where: { role: "EMPLOYEE", createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
    }),
  ]);
  const expected = current.PAID.amount + current.DUE.amount + current.OVERDUE.amount;
  return {
    period,
    totalEmployees,
    newEmployees,
    activeVehicles,
    paidThisMonth: current.PAID.amount,
    paidCountThisMonth: current.PAID.count,
    paidLastMonth: prev.PAID.amount,
    expectedThisMonth: expected,
    collectionRate: expected ? Math.round((current.PAID.amount / expected) * 100) : 0,
    outstanding: outstanding._sum.amount ?? 0,
    outstandingCount: outstanding._count._all,
    overdueCount: current.OVERDUE.count,
  };
}

export async function getRecentFeeActivity(limit = 8, period: Period = currentPeriod()) {
  return prisma.parkingFee.findMany({
    where: { month: period.month, year: period.year, status: { not: "CANCELLED" } },
    include: feeListInclude,
    orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: limit,
  });
}

export async function getDueFees(limit = 8, now: Date = new Date()) {
  const fees = await prisma.parkingFee.findMany({
    where: { status: { in: ["DUE", "OVERDUE"] } },
    include: feeListInclude,
    orderBy: [{ dueDate: "asc" }],
    take: limit,
  });
  return fees.map((f) => ({ ...f, daysOverdue: daysOverdue(f.dueDate, now) }));
}

export async function getReportRows(query: ReportQuery, take = 5000) {
  return prisma.parkingFee.findMany({
    where: buildReportWhere(query),
    include: feeListInclude,
    orderBy: [{ year: "desc" }, { month: "desc" }, { user: { name: "asc" } }],
    take,
  });
}
