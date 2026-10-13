import "server-only";
import { prisma } from "@/server/db";
import { logAudit } from "@/server/services/audit.service";
import { ConflictError, NotFoundError, isUniqueConstraintError } from "@/server/errors";
import { rupeesToPaise } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/guards";
import type { CategoryInput } from "@/lib/validations/parking";

export function categoryNameKey(name: string) {
  return name.trim().toLowerCase();
}

export async function listCategories() {
  const categories = await prisma.vehicleCategory.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { vehicles: { where: { status: "ACTIVE" } } } } },
  });
  return categories.map(({ _count, ...category }) => ({
    ...category,
    activeVehicleCount: _count.vehicles,
  }));
}

export async function listActiveCategories() {
  return prisma.vehicleCategory.findMany({
    where: { active: true },
    select: { id: true, name: true, monthlyFee: true },
    orderBy: { name: "asc" },
  });
}

async function assertNameAvailable(nameKey: string, excludeId?: string) {
  const clash = await prisma.vehicleCategory.findFirst({
    where: { nameKey, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw new ConflictError("A category with this name already exists.", { name: "This name is already in use" });
  }
}

function rethrowNameClash(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new ConflictError("A category with this name already exists.", { name: "This name is already in use" });
  }
  throw error;
}

export async function createCategory(actor: CurrentUser, input: CategoryInput) {
  const name = input.name.trim();
  const nameKey = categoryNameKey(name);
  await assertNameAvailable(nameKey);
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.vehicleCategory.create({
        data: { name, nameKey, monthlyFee: rupeesToPaise(input.monthlyFee), active: input.active },
      });
      await logAudit(
        {
          actorId: actor.id,
          action: "CATEGORY_CREATED",
          entityType: "VehicleCategory",
          entityId: category.id,
          description: `Created vehicle category ${category.name}`,
          metadata: { name: category.name, monthlyFee: category.monthlyFee, active: category.active },
        },
        tx,
      );
      return category;
    });
  } catch (error) {
    rethrowNameClash(error);
  }
}

export async function updateCategory(actor: CurrentUser, id: string, input: CategoryInput) {
  const existing = await prisma.vehicleCategory.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Vehicle category");

  const name = input.name.trim();
  const nameKey = categoryNameKey(name);
  if (nameKey !== existing.nameKey) await assertNameAvailable(nameKey, id);

  const deactivating = existing.active && !input.active;
  if (deactivating) {
    const activeVehicles = await prisma.vehicle.count({ where: { categoryId: id, status: "ACTIVE" } });
    if (activeVehicles > 0) {
      throw new ConflictError(
        `Move the ${activeVehicles} active vehicle${activeVehicles === 1 ? "" : "s"} in ${existing.name} to another category before deactivating it.`,
      );
    }
  }

  const data = { name, nameKey, monthlyFee: rupeesToPaise(input.monthlyFee), active: input.active };
  const statusChanged = existing.active !== input.active;
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.vehicleCategory.update({ where: { id }, data });
      await logAudit(
        {
          actorId: actor.id,
          action: statusChanged ? (input.active ? "CATEGORY_ACTIVATED" : "CATEGORY_DEACTIVATED") : "CATEGORY_UPDATED",
          entityType: "VehicleCategory",
          entityId: id,
          description: statusChanged
            ? `${input.active ? "Activated" : "Deactivated"} vehicle category ${category.name}`
            : `Updated vehicle category ${category.name}`,
          metadata: {
            before: { name: existing.name, monthlyFee: existing.monthlyFee, active: existing.active },
            after: { name: category.name, monthlyFee: category.monthlyFee, active: category.active },
          },
        },
        tx,
      );
      return category;
    });
  } catch (error) {
    rethrowNameClash(error);
  }
}
