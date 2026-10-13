import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createCategory, updateCategory } from "@/server/services/category.service";
import { ConflictError } from "@/server/errors";
import { categoryByName, createUser, createVehicle, resetDb } from "./fixtures";

describe("vehicle categories", () => {
  beforeEach(resetDb);

  it("rejects a duplicate name regardless of case", async () => {
    const admin = await createUser("ADMIN");
    await expect(createCategory(admin, { name: " car ", monthlyFee: 100, active: true })).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to deactivate a category that still has an active vehicle", async () => {
    const admin = await createUser("ADMIN");
    const employee = await createUser();
    const car = await categoryByName("Car");
    await createVehicle(employee.id);
    await expect(updateCategory(admin, car.id, { name: "Car", monthlyFee: 500, active: false })).rejects.toBeInstanceOf(ConflictError);
    expect((await prisma.vehicleCategory.findUniqueOrThrow({ where: { id: car.id } })).active).toBe(true);
  });

  it("audits create, update, and deactivation", async () => {
    const admin = await createUser("ADMIN");
    const created = await createCategory(admin, { name: "Electric", monthlyFee: 600, active: true });
    await updateCategory(admin, created.id, { name: "Electric", monthlyFee: 650, active: true });
    await updateCategory(admin, created.id, { name: "Electric", monthlyFee: 650, active: false });
    const actions = await prisma.auditLog.findMany({ where: { entityId: created.id }, orderBy: { createdAt: "asc" } });
    expect(actions.map((a) => a.action)).toEqual(["CATEGORY_CREATED", "CATEGORY_UPDATED", "CATEGORY_DEACTIVATED"]);
  });
});
