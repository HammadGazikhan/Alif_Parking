import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { logAudit } from "@/server/services/audit.service";
import { tryEnsureCurrentPeriodFees } from "@/server/services/fee-generation.service";
import { paginate, skipTake } from "@/server/services/pagination";
import { ConflictError, NotFoundError, ValidationError, isUniqueConstraintError } from "@/server/errors";
import type { CurrentUser } from "@/server/auth/guards";
import type { VehicleInput, VehicleListQuery, VehicleUpdateInput } from "@/lib/validations/vehicle";
import { ROSTER_ROLES } from "@/lib/constants";
import { normalizeVehicleNumber } from "@/lib/vehicle";

const vehicleListInclude = {
  user: { select: { id: true, name: true, email: true, status: true } },
  category: { select: { id: true, name: true, active: true, monthlyFee: true } },
} satisfies Prisma.VehicleInclude;

export type VehicleListItem = Prisma.VehicleGetPayload<{ include: typeof vehicleListInclude }>;

export async function listVehicles(query: VehicleListQuery) {
  const search = query.search?.trim();
  const where: Prisma.VehicleWhereInput = {
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(search
      ? {
          OR: [
            { number: { contains: normalizeVehicleNumber(search), mode: "insensitive" } },
            { user: { name: { contains: search, mode: "insensitive" } } },
            { user: { email: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: vehicleListInclude,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      ...skipTake(query),
    }),
    prisma.vehicle.count({ where }),
  ]);
  return paginate(items, total, query);
}

export async function getVehicle(id: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id }, include: vehicleListInclude });
  if (!vehicle) throw new NotFoundError("Vehicle");
  return vehicle;
}

async function assertCategoryAssignable(categoryId: string) {
  const category = await prisma.vehicleCategory.findUnique({ where: { id: categoryId }, select: { id: true, active: true, name: true } });
  if (!category || !category.active) {
    throw new ValidationError("Select an active vehicle category.", { categoryId: "Select an active category" });
  }
  return category;
}

async function assertOwnerIsEmployee(userId: string) {
  const owner = await prisma.user.findFirst({ where: { id: userId, role: { in: [...ROSTER_ROLES] } }, select: { id: true } });
  if (!owner) throw new ValidationError("Select a valid employee.", { userId: "Select a valid employee" });
}

async function assertNumberAvailable(number: string, excludeId?: string) {
  const clash = await prisma.vehicle.findFirst({
    where: { number, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw new ConflictError(`Vehicle ${number} is already registered.`, {
      number: "This vehicle number is already registered",
    });
  }
}

function rethrowDuplicate(error: unknown, number?: string): never {
  if (isUniqueConstraintError(error)) {
    throw new ConflictError(`Vehicle ${number ?? ""} is already registered.`.replace("  ", " "), {
      number: "This vehicle number is already registered",
    });
  }
  throw error;
}

export async function createVehicle(actor: CurrentUser, input: VehicleInput) {
  const number = normalizeVehicleNumber(input.number);
  await assertOwnerIsEmployee(input.userId);
  if (input.status === "ACTIVE") await assertCategoryAssignable(input.categoryId);
  await assertNumberAvailable(number);
  let created: VehicleListItem;
  try {
    created = await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({
        data: {
          userId: input.userId,
          number,
          categoryId: input.categoryId,
          status: input.status,
        },
        include: vehicleListInclude,
      });
      await logAudit(
        {
          actorId: actor.id,
          action: "VEHICLE_CREATED",
          entityType: "Vehicle",
          entityId: vehicle.number,
          description: `Registered ${vehicle.category.name.toLowerCase()} ${vehicle.number} for ${vehicle.user.name}`,
          metadata: { vehicleId: vehicle.id, userId: vehicle.userId },
        },
        tx,
      );
      return vehicle;
    });
  } catch (error) {
    rethrowDuplicate(error, number);
  }
  return withLateAdditionFee(actor, created);
}

export async function updateVehicle(actor: CurrentUser, id: string, input: VehicleUpdateInput) {
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Vehicle");
  const number = input.number !== undefined ? normalizeVehicleNumber(input.number) : undefined;
  if (input.userId && input.userId !== existing.userId) await assertOwnerIsEmployee(input.userId);
  if (number && number !== existing.number) await assertNumberAvailable(number, id);
  const nextStatus = input.status ?? existing.status;
  const nextCategoryId = input.categoryId ?? existing.categoryId;
  if (nextStatus === "ACTIVE" && (input.categoryId !== undefined || input.status === "ACTIVE")) {
    await assertCategoryAssignable(nextCategoryId);
  }

  const data: Prisma.VehicleUncheckedUpdateInput = {
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    ...(number !== undefined ? { number } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };

  let updated: VehicleListItem;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.update({ where: { id }, data, include: vehicleListInclude });
      await logAudit(
        {
          actorId: actor.id,
          action: "VEHICLE_UPDATED",
          entityType: "Vehicle",
          entityId: vehicle.number,
          description:
            input.status && input.status !== existing.status
              ? `${input.status === "ACTIVE" ? "Activated" : "Deactivated"} vehicle ${vehicle.number}`
              : `Updated vehicle ${vehicle.number}`,
          metadata: { vehicleId: id, fields: Object.keys(data) },
        },
        tx,
      );
      return vehicle;
    });
  } catch (error) {
    rethrowDuplicate(error, number);
  }
  return withLateAdditionFee(actor, updated);
}

/** If the month was already generated, bill a vehicle that just became billable. */
async function withLateAdditionFee(actor: CurrentUser, vehicle: VehicleListItem) {
  const billing = vehicle.status === "ACTIVE" ? await tryEnsureCurrentPeriodFees(actor, { vehicleId: vehicle.id }) : null;
  return { ...vehicle, feeCreatedFor: billing?.created ? billing.period : null };
}

/** Hard-delete only vehicles with no billing history; otherwise deactivate. */
export async function deleteVehicle(actor: CurrentUser, id: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { _count: { select: { parkingFees: true } } },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");
  if (vehicle._count.parkingFees > 0) {
    throw new ConflictError("This vehicle has billing history. Deactivate it instead of deleting.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.vehicle.delete({ where: { id } });
    await logAudit(
      {
        actorId: actor.id,
        action: "VEHICLE_DELETED",
        entityType: "Vehicle",
        entityId: vehicle.number,
        description: `Deleted vehicle ${vehicle.number}`,
        metadata: { vehicleId: id },
      },
      tx,
    );
  });
}
