import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { logAudit } from "@/server/services/audit.service";
import { messages, notify } from "@/server/services/notification.service";
import { getSettings } from "@/server/services/settings.service";
import { ValidationError } from "@/server/errors";
import type { CurrentUser } from "@/server/auth/guards";
import { computeDueDate, currentPeriod, endOfIstDayAfter, formatBillingPeriod } from "@/lib/dates";

/** Minimum time a late-added fee gets before it falls due. */
const LATE_ADDITION_GRACE_DAYS = 7;

/** Active vehicles of active, parking-eligible employees who are not on a free pass, in an active category. */
async function eligibleVehicles(scope: Prisma.VehicleWhereInput = {}) {
  return prisma.vehicle.findMany({
    where: {
      ...scope,
      status: "ACTIVE",
      category: { active: true },
      user: { role: "EMPLOYEE", status: "ACTIVE", parkingEligible: true, freePass: false },
    },
    select: {
      id: true,
      number: true,
      userId: true,
      category: { select: { monthlyFee: true } },
    },
  });
}

async function buildPlan(month: number, year: number) {
  const [settings, vehicles, existing] = await Promise.all([
    getSettings(),
    eligibleVehicles(),
    prisma.parkingFee.findMany({ where: { month, year }, select: { vehicleId: true } }),
  ]);
  const existingIds = new Set(existing.map((f) => f.vehicleId));
  const dueDate = computeDueDate(month, year, settings.dueDay);

  const rows = vehicles.map((v) => {
    const amount = v.category.monthlyFee;
    return {
      userId: v.userId,
      vehicleId: v.id,
      month,
      year,
      baseAmount: amount,
      lateFee: 0,
      amount,
      status: "DUE" as const,
      dueDate,
      exists: existingIds.has(v.id),
    };
  });
  return { settings, dueDate, rows, employeeCount: new Set(vehicles.map((v) => v.userId)).size };
}

export async function previewFeeGeneration(month: number, year: number) {
  const { settings, dueDate, rows, employeeCount } = await buildPlan(month, year);
  const pending = rows.filter((r) => !r.exists);
  return {
    month,
    year,
    period: formatBillingPeriod(month, year),
    feesEnabled: settings.feesEnabled,
    dueDate,
    eligibleEmployees: employeeCount,
    eligibleVehicles: rows.length,
    alreadyGenerated: rows.length - pending.length,
    toGenerate: pending.length,
    expectedCollection: pending.reduce((sum, r) => sum + r.amount, 0),
  };
}

/**
 * Create fees for every eligible vehicle in the period. The composite unique
 * key (vehicle, month, year) plus `skipDuplicates` guarantees that
 * concurrent or repeated runs never create duplicates.
 */
export async function generateMonthlyFees(actor: CurrentUser, month: number, year: number) {
  const { settings, rows } = await buildPlan(month, year);
  if (!settings.feesEnabled) {
    throw new ValidationError("Parking fees are disabled in settings. Enable them before generating fees.");
  }
  const pending = rows.filter((r) => !r.exists);
  const period = formatBillingPeriod(month, year);

  const result = await prisma.$transaction(async (tx) => {
    const created = pending.length
      ? await tx.parkingFee.createMany({
          data: pending.map(({ exists: _exists, ...row }) => {
            void _exists;
            return row;
          }),
          skipDuplicates: true,
        })
      : { count: 0 };

    const fees = created.count
      ? await tx.parkingFee.findMany({
          where: { month, year, vehicleId: { in: pending.map((p) => p.vehicleId) } },
        })
      : [];
    const dispatch = await notify(fees.map((f) => messages.feeDue(f)), tx);

    await logAudit(
      {
        actorId: actor.id,
        action: "FEES_GENERATED",
        entityType: "ParkingFee",
        entityId: `${year}-${String(month).padStart(2, "0")}`,
        description: `Generated ${created.count} parking fee${created.count === 1 ? "" : "s"} for ${period}`,
        metadata: {
          created: created.count,
          skipped: rows.length - created.count,
          total: fees.reduce((s, f) => s + f.amount, 0),
        },
      },
      tx,
    );
    return { created: created.count, dispatch };
  });

  await result.dispatch();
  return {
    period,
    created: result.created,
    skipped: rows.length - result.created,
  };
}

/**
 * Bill vehicles that became billable after the current month was generated
 * (new vehicle, reactivation, eligibility switched on) so the employee can pay
 * without the admin re-running generation. Does nothing until the month has
 * been generated, and never bills a vehicle twice in a month — even after it
 * changes owner, or if its fee was cancelled.
 */
export async function ensureCurrentPeriodFees(
  actor: CurrentUser,
  scope: { vehicleId?: string; userId?: string },
  now: Date = new Date(),
) {
  const { month, year } = currentPeriod(now);
  const period = formatBillingPeriod(month, year);
  const none = { period, created: 0 };

  const settings = await getSettings();
  if (!settings.feesEnabled) return none;
  const generated = await prisma.parkingFee.findFirst({ where: { month, year }, select: { id: true } });
  if (!generated) return none;

  const vehicles = await eligibleVehicles({
      ...(scope.vehicleId ? { id: scope.vehicleId } : {}),
      ...(scope.userId ? { userId: scope.userId } : {}),
  });
  if (!vehicles.length) return none;
  const billed = await prisma.parkingFee.findMany({
    where: { month, year, vehicleId: { in: vehicles.map((v) => v.id) } },
    select: { vehicleId: true },
  });
  const billedIds = new Set(billed.map((f) => f.vehicleId));
  const pending = vehicles.filter((v) => !billedIds.has(v.id));
  if (!pending.length) return none;

  const normalDue = computeDueDate(month, year, settings.dueDay);
  const graceDue = endOfIstDayAfter(now, LATE_ADDITION_GRACE_DAYS);
  const dueDate = graceDue > normalDue ? graceDue : normalDue;

  const result = await prisma.$transaction(async (tx) => {
    const fees = await tx.parkingFee.createManyAndReturn({
      data: pending.map((v) => ({
        userId: v.userId,
        vehicleId: v.id,
        month,
        year,
        baseAmount: v.category.monthlyFee,
        lateFee: 0,
        amount: v.category.monthlyFee,
        status: "DUE" as const,
        dueDate,
      })),
      skipDuplicates: true,
    });
    if (!fees.length) return { created: 0, dispatch: async () => {} };

    const dispatch = await notify(fees.map((f) => messages.feeDue(f)), tx);
    const numbers = pending.filter((v) => fees.some((f) => f.vehicleId === v.id)).map((v) => v.number);
    await logAudit(
      {
        actorId: actor.id,
        action: "FEES_GENERATED",
        entityType: "ParkingFee",
        entityId: `${year}-${String(month).padStart(2, "0")}`,
        description: `Created ${period} fee for ${numbers.join(", ")} (added after generation)`,
        metadata: { created: fees.length, vehicleIds: fees.map((f) => f.vehicleId), lateAddition: true },
      },
      tx,
    );
    return { created: fees.length, dispatch };
  });

  await result.dispatch();
  return { period, created: result.created };
}

/** For callers whose own save already succeeded: billing failure must not undo or fail it. */
export async function tryEnsureCurrentPeriodFees(actor: CurrentUser, scope: { vehicleId?: string; userId?: string }) {
  try {
    return await ensureCurrentPeriodFees(actor, scope);
  } catch (error) {
    console.error("[fees] Late-addition billing failed", error);
    return null;
  }
}
