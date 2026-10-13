import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  ensureCurrentPeriodFees,
  generateMonthlyFees,
  previewFeeGeneration,
} from "@/server/services/fee-generation.service";
import { updateSettings } from "@/server/services/settings.service";
import { updateCategory } from "@/server/services/category.service";
import { createVehicle as registerVehicle, updateVehicle } from "@/server/services/vehicle.service";
import { updateEmployee } from "@/server/services/employee.service";
import { markOverdueFees } from "@/server/services/parking-fee.service";
import { createPaymentOrder } from "@/server/services/payment.service";
import { currentPeriod } from "@/lib/dates";
import { categoryByName, createUser, createVehicle, resetDb } from "./fixtures";

const PERIOD = { month: 3, year: 2031 };

describe("monthly fee generation", () => {
  beforeEach(resetDb);

  it("creates exactly one fee per eligible vehicle and never duplicates on re-run", async () => {
    const admin = await createUser("ADMIN");
    const a = await createUser();
    const b = await createUser();
    await createVehicle(a.id);
    await createVehicle(a.id);
    await createVehicle(b.id);

    const first = await generateMonthlyFees(admin, PERIOD.month, PERIOD.year);
    expect(first.created).toBe(3);

    const second = await generateMonthlyFees(admin, PERIOD.month, PERIOD.year);
    expect(second).toMatchObject({ created: 0, skipped: 3 });

    expect(await prisma.parkingFee.count({ where: PERIOD })).toBe(3);
  });

  it("is safe under concurrent generation requests", async () => {
    const admin = await createUser("ADMIN");
    for (let i = 0; i < 5; i++) {
      const e = await createUser();
      await createVehicle(e.id);
    }
    const results = await Promise.all(
      Array.from({ length: 4 }, () => generateMonthlyFees(admin, PERIOD.month, PERIOD.year)),
    );
    expect(results.reduce((s, r) => s + r.created, 0)).toBe(5);
    expect(await prisma.parkingFee.count({ where: PERIOD })).toBe(5);
  });

  it("is enforced by a database unique constraint", async () => {
    const e = await createUser();
    const v = await createVehicle(e.id);
    const data = {
      userId: e.id,
      vehicleId: v.id,
      ...PERIOD,
      baseAmount: 50000,
      amount: 50000,
      dueDate: new Date(),
    };
    await prisma.parkingFee.create({ data });
    await expect(prisma.parkingFee.create({ data })).rejects.toMatchObject({ code: "P2002" });
  });

  it("skips inactive employees, ineligible employees and inactive vehicles", async () => {
    const admin = await createUser("ADMIN");
    const active = await createUser();
    const inactive = await createUser("EMPLOYEE", { status: "INACTIVE" });
    const ineligible = await createUser("EMPLOYEE", { parkingEligible: false });
    const freePass = await createUser("EMPLOYEE", { freePass: true });
    await createVehicle(active.id);
    await createVehicle(inactive.id);
    await createVehicle(ineligible.id);
    await createVehicle(freePass.id);
    const parked = await createVehicle(active.id);
    await prisma.vehicle.update({ where: { id: parked.id }, data: { status: "INACTIVE" } });
    const other = await categoryByName("Other");
    await prisma.vehicleCategory.update({ where: { id: other.id }, data: { active: false } });
    await createVehicle(active.id, `MH${Math.floor(Math.random() * 90 + 10)}ZZ${Math.floor(Math.random() * 9000 + 1000)}`, "Other");

    const preview = await previewFeeGeneration(PERIOD.month, PERIOD.year);
    expect(preview).toMatchObject({ eligibleEmployees: 1, eligibleVehicles: 1, toGenerate: 1 });
    expect((await generateMonthlyFees(admin, PERIOD.month, PERIOD.year)).created).toBe(1);
  });

  it("bills each category's monthly fee on the same due day", async () => {
    const admin = await createUser("ADMIN");
    await updateSettings(admin, { dueDay: 5, lateFee: 100, feesEnabled: true });
    const bike = await categoryByName("Bike");
    await updateCategory(admin, bike.id, { name: "Bike", monthlyFee: 200, active: true });
    await createVehicle((await createUser()).id);
    await createVehicle((await createUser()).id, `MH${Math.floor(Math.random() * 90 + 10)}BK${Math.floor(Math.random() * 9000 + 1000)}`, "Bike");

    await generateMonthlyFees(admin, PERIOD.month, PERIOD.year);
    const fees = await prisma.parkingFee.findMany({
      where: PERIOD,
      include: { vehicle: { include: { category: true } } },
    });
    const byCategory = Object.fromEntries(fees.map((f) => [f.vehicle.category.name, f.amount]));
    expect(byCategory).toEqual({ Car: 50000, Bike: 20000 });
    expect(new Set(fees.map((f) => f.dueDate.toISOString()))).toEqual(new Set(["2031-03-05T18:29:59.000Z"]));
  });

  it("keeps an existing bill when the category fee or due day changes", async () => {
    const admin = await createUser("ADMIN");
    await createVehicle((await createUser()).id);
    await generateMonthlyFees(admin, PERIOD.month, PERIOD.year);
    const before = await prisma.parkingFee.findFirstOrThrow({ where: PERIOD });
    const car = await categoryByName("Car");
    await updateCategory(admin, car.id, { name: "Car", monthlyFee: 900, active: true });
    await updateSettings(admin, { dueDay: 20, lateFee: 75, feesEnabled: true });
    const after = await prisma.parkingFee.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.baseAmount).toBe(before.baseAmount);
    expect(after.amount).toBe(before.amount);
    expect(after.lateFee).toBe(0);
    expect(after.dueDate.toISOString()).toBe(before.dueDate.toISOString());
  });

  it("does not create another row for a cancelled bill in the same month", async () => {
    const admin = await createUser("ADMIN");
    const vehicle = await createVehicle((await createUser()).id);
    await generateMonthlyFees(admin, PERIOD.month, PERIOD.year);
    await prisma.parkingFee.updateMany({ where: { vehicleId: vehicle.id, ...PERIOD }, data: { status: "CANCELLED" } });
    expect(await generateMonthlyFees(admin, PERIOD.month, PERIOD.year)).toMatchObject({ created: 0, skipped: 1 });
    expect(await prisma.parkingFee.count({ where: { vehicleId: vehicle.id, ...PERIOD } })).toBe(1);
  });

  it("applies the global late fee once and leaves paid bills alone", async () => {
    const admin = await createUser("ADMIN");
    await updateSettings(admin, { dueDay: 10, lateFee: 75, feesEnabled: true });
    await createVehicle((await createUser()).id);
    const paidOwner = await createUser();
    const paidVehicle = await createVehicle(paidOwner.id);
    await generateMonthlyFees(admin, PERIOD.month, PERIOD.year);
    await prisma.parkingFee.updateMany({ where: { vehicleId: paidVehicle.id }, data: { status: "PAID", paidAt: new Date() } });

    const past = new Date("2031-03-11T00:00:00Z");
    expect(await markOverdueFees(past)).toMatchObject({ updated: 1 });
    const overdue = await prisma.parkingFee.findFirstOrThrow({ where: { ...PERIOD, status: "OVERDUE" } });
    expect(overdue).toMatchObject({ lateFee: 7500, amount: overdue.baseAmount + 7500 });
    const paid = await prisma.parkingFee.findFirstOrThrow({ where: { vehicleId: paidVehicle.id } });
    expect(paid).toMatchObject({ status: "PAID", lateFee: 0, amount: paid.baseAmount });

    await updateSettings(admin, { dueDay: 10, lateFee: 200, feesEnabled: true });
    expect(await markOverdueFees(past)).toMatchObject({ updated: 0 });
    expect((await prisma.parkingFee.findUniqueOrThrow({ where: { id: overdue.id } })).amount).toBe(overdue.amount);
  });

  it("charges the stored bill total, including a late fee, when a payment starts", async () => {
    const admin = await createUser("ADMIN");
    await updateSettings(admin, { dueDay: 1, lateFee: 50, feesEnabled: true });
    const employee = await createUser();
    await createVehicle(employee.id);
    await generateMonthlyFees(admin, PERIOD.month, PERIOD.year);
    await markOverdueFees(new Date("2031-04-01T00:00:00Z"));
    const fee = await prisma.parkingFee.findFirstOrThrow({ where: PERIOD });
    const view = await createPaymentOrder(employee, fee.id);
    expect(fee.lateFee).toBe(5000);
    expect(fee.amount).toBe(fee.baseAmount + fee.lateFee);
    expect(view.amount).toBe(fee.amount);
  });

  it("refuses to generate when fees are disabled", async () => {
    const admin = await createUser("ADMIN");
    await updateSettings(admin, { dueDay: 10, lateFee: 50, feesEnabled: false });
    await expect(generateMonthlyFees(admin, PERIOD.month, PERIOD.year)).rejects.toThrow(/disabled/);
    expect(await prisma.parkingFee.count()).toBe(0);
  });
});

describe("late additions after the month was generated", () => {
  beforeEach(resetDb);

  const NOW_PERIOD = currentPeriod();
  const DAY = 24 * 60 * 60 * 1000;
  const register = async (admin: Awaited<ReturnType<typeof createUser>>, userId: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE") => {
    const car = await categoryByName("Car");
    return registerVehicle(admin, {
      userId,
      number: `KA${Math.floor(Math.random() * 90 + 10)}LA${Math.floor(Math.random() * 9000 + 1000)}`,
      categoryId: car.id,
      status,
    });
  };

  /** An admin plus the current month already generated for one existing employee. */
  async function generatedMonth() {
    const admin = await createUser("ADMIN");
    const existing = await createUser();
    await createVehicle(existing.id);
    await generateMonthlyFees(admin, NOW_PERIOD.month, NOW_PERIOD.year);
    return admin;
  }

  it("bills a vehicle added after generation so the employee can pay right away", async () => {
    const admin = await generatedMonth();
    const late = await createUser();
    const before = Date.now();
    const vehicle = await register(admin, late.id);

    expect(vehicle.feeCreatedFor).toMatch(String(NOW_PERIOD.year));
    const fee = await prisma.parkingFee.findFirstOrThrow({ where: { vehicleId: vehicle.id, ...NOW_PERIOD } });
    expect(fee).toMatchObject({ userId: late.id, status: "DUE", amount: 50000, lateFee: 0 });
    expect(fee.dueDate.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY - 1000);
    expect(await prisma.notification.count({ where: { userId: late.id, type: "PAYMENT_DUE" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "FEES_GENERATED", description: { contains: vehicle.number } } })).toBe(1);
  });

  it("does nothing until the month has been generated", async () => {
    const admin = await createUser("ADMIN");
    const e = await createUser();
    const vehicle = await register(admin, e.id);
    expect(vehicle.feeCreatedFor).toBeNull();
    expect(await prisma.parkingFee.count()).toBe(0);
  });

  it("does nothing when fees are disabled or the vehicle/employee isn't billable", async () => {
    const admin = await generatedMonth();
    const ineligible = await createUser("EMPLOYEE", { parkingEligible: false });
    expect((await register(admin, ineligible.id)).feeCreatedFor).toBeNull();
    const e = await createUser();
    expect((await register(admin, e.id, "INACTIVE")).feeCreatedFor).toBeNull();

    await updateSettings(admin, { dueDay: 10, lateFee: 50, feesEnabled: false });
    expect((await register(admin, e.id)).feeCreatedFor).toBeNull();
    expect(await prisma.parkingFee.count()).toBe(1);
  });

  it("bills an employee when they are re-activated or made eligible", async () => {
    const admin = await createUser("ADMIN");
    const inactive = await createUser("EMPLOYEE", { status: "INACTIVE" });
    const ineligible = await createUser("EMPLOYEE", { parkingEligible: false });
    await createVehicle(inactive.id);
    await createVehicle(ineligible.id);
    await createVehicle((await createUser()).id);
    expect((await generateMonthlyFees(admin, NOW_PERIOD.month, NOW_PERIOD.year)).created).toBe(1);

    expect((await updateEmployee(admin, inactive.id, { status: "ACTIVE" }))!.feeCreatedFor).not.toBeNull();
    expect((await updateEmployee(admin, ineligible.id, { parkingEligible: true }))!.feeCreatedFor).not.toBeNull();
    expect((await updateEmployee(admin, ineligible.id, { name: "Renamed" }))!.feeCreatedFor).toBeNull();
    expect(await prisma.parkingFee.count({ where: NOW_PERIOD })).toBe(3);
  });

  it("never duplicates: repeat calls and a later Generate create nothing new", async () => {
    const admin = await generatedMonth();
    const e = await createUser();
    const vehicle = await register(admin, e.id);

    expect((await ensureCurrentPeriodFees(admin, { vehicleId: vehicle.id })).created).toBe(0);
    const bike = await categoryByName("Bike");
    expect((await updateVehicle(admin, vehicle.id, { categoryId: bike.id })).feeCreatedFor).toBeNull();
    expect(await previewFeeGeneration(NOW_PERIOD.month, NOW_PERIOD.year)).toMatchObject({ toGenerate: 0 });
    expect(await prisma.parkingFee.count({ where: NOW_PERIOD })).toBe(2);
  });

  it("doesn't bill a vehicle twice in a month when it changes owner", async () => {
    const admin = await generatedMonth();
    const vehicle = await prisma.vehicle.findFirstOrThrow();
    const newOwner = await createUser();
    expect((await updateVehicle(admin, vehicle.id, { userId: newOwner.id })).feeCreatedFor).toBeNull();
    expect(await prisma.parkingFee.count({ where: { vehicleId: vehicle.id } })).toBe(1);
  });

  it("uses the normal due date unless that leaves fewer than 7 days", async () => {
    const admin = await createUser("ADMIN");
    await createVehicle((await createUser()).id);
    await generateMonthlyFees(admin, PERIOD.month, PERIOD.year);

    const early = await createVehicle((await createUser()).id);
    await ensureCurrentPeriodFees(admin, { vehicleId: early.id }, new Date("2031-03-01T06:00:00Z"));
    const late = await createVehicle((await createUser()).id);
    await ensureCurrentPeriodFees(admin, { vehicleId: late.id }, new Date("2031-03-20T06:00:00Z"));

    const due = async (vehicleId: string) =>
      (await prisma.parkingFee.findFirstOrThrow({ where: { vehicleId } })).dueDate.toISOString();
    expect(await due(early.id)).toBe("2031-03-10T18:29:59.000Z");
    expect(await due(late.id)).toBe("2031-03-27T18:29:59.000Z");
  });
});
