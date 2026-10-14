import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createVehicle, updateVehicle } from "@/server/services/vehicle.service";
import { ConflictError, ValidationError } from "@/server/errors";
import { normalizeVehicleNumber } from "@/lib/vehicle";
import { vehicleFormSchema } from "@/lib/validations/vehicle";
import { categoryByName, createUser, resetDb } from "./fixtures";

const form = (userId: string, number: string, categoryId: string) =>
  vehicleFormSchema.parse({
    userId,
    number,
    categoryId,
    status: "ACTIVE",
  });

describe("vehicle numbers", () => {
  beforeEach(resetDb);

  it("normalizes to uppercase without spaces, hyphens or dots", async () => {
    const car = await categoryByName("Car");
    expect(normalizeVehicleNumber("mh 12-ab.1234")).toBe("MH12AB1234");
    expect(form("u", " mh12 ab 1234 ", car.id).number).toBe("MH12AB1234");
    expect(() => form("u", "MH-12-AB-1234-XYZ99", car.id)).toThrow();
  });

  it("rejects duplicates regardless of formatting", async () => {
    const admin = await createUser("ADMIN");
    const car = await categoryByName("Car");
    const a = await createUser();
    const b = await createUser();
    await createVehicle(admin, form(a.id, "MH12AB1234", car.id));
    await expect(createVehicle(admin, form(b.id, "mh 12 ab-1234", car.id))).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.vehicle.count()).toBe(1);
  });

  it("rejects renaming a vehicle to an existing number", async () => {
    const admin = await createUser("ADMIN");
    const car = await categoryByName("Car");
    const a = await createUser();
    await createVehicle(admin, form(a.id, "MH12AB1234", car.id));
    const other = await createVehicle(admin, form(a.id, "MH14CD5678", car.id));
    await expect(updateVehicle(admin, other.id, { number: "MH12AB1234" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("assigns a vehicle to an administrator and rejects an unknown owner", async () => {
    const admin = await createUser("ADMIN");
    const car = await categoryByName("Car");
    const vehicle = await createVehicle(admin, form(admin.id, "KA01AA0001", car.id));
    expect(vehicle.userId).toBe(admin.id);
    await expect(createVehicle(admin, form("missing-user", "KA01AA0002", car.id))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an inactive category for an active vehicle", async () => {
    const admin = await createUser("ADMIN");
    const employee = await createUser();
    const car = await categoryByName("Car");
    await prisma.vehicleCategory.update({ where: { id: car.id }, data: { active: false } });
    await expect(createVehicle(admin, form(employee.id, "KA01AA0002", car.id))).rejects.toBeInstanceOf(ValidationError);
  });

  it("audits vehicle creation", async () => {
    const admin = await createUser("ADMIN");
    const car = await categoryByName("Car");
    const a = await createUser();
    await createVehicle(admin, form(a.id, "DL3CAB0001", car.id));
    expect(await prisma.auditLog.count({ where: { action: "VEHICLE_CREATED", actorId: admin.id } })).toBe(1);
  });
});
