import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createPaymentOrder, getPaymentStatus, getReceipt } from "@/server/services/payment.service";
import { createOrderSchema } from "@/lib/validations/payment";
import { NotFoundError } from "@/server/errors";
import { createUser, employeeWithFee, resetDb } from "./fixtures";

describe("payment order creation", () => {
  beforeEach(resetDb);

  it("strips client-supplied amount, userId and status from the request", () => {
    const parsed = createOrderSchema.parse({ feeId: "fee_1", amount: 1, userId: "someone-else", status: "SUCCESS" });
    expect(parsed).toEqual({ feeId: "fee_1" });
  });

  it("always charges the amount stored on the fee", async () => {
    const { employee, fee } = await employeeWithFee(65000);
    const view = await createPaymentOrder(employee, fee.id);
    expect(view.amount).toBe(65000);
    expect(view.status).toBe("PENDING");
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: view.id } });
    expect(stored.amount).toBe(65000);
    expect(view.upiUri).toContain("am=650.00");
  });

  it("does not let an employee pay (or see) another employee's fee", async () => {
    const { employee, fee } = await employeeWithFee();
    const intruder = await createUser();
    await expect(createPaymentOrder(intruder, fee.id)).rejects.toBeInstanceOf(NotFoundError);

    const view = await createPaymentOrder(employee, fee.id);
    await expect(getPaymentStatus(intruder, view.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reuses the open QR for repeated or concurrent clicks", async () => {
    const { employee, fee } = await employeeWithFee();
    const views = await Promise.all([1, 2, 3].map(() => createPaymentOrder(employee, fee.id)));
    expect(new Set(views.map((v) => v.id)).size).toBe(1);
    expect(await prisma.payment.count({ where: { parkingFeeId: fee.id } })).toBe(1);
  });

  it("refuses to create an order for a paid or cancelled fee", async () => {
    const { employee, fee } = await employeeWithFee();
    await prisma.parkingFee.update({ where: { id: fee.id }, data: { status: "PAID", paidAt: new Date() } });
    await expect(createPaymentOrder(employee, fee.id)).rejects.toThrow(/already been paid/);
    await prisma.parkingFee.update({ where: { id: fee.id }, data: { status: "CANCELLED", paidAt: null } });
    await expect(createPaymentOrder(employee, fee.id)).rejects.toThrow(/cancelled/);
  });

  it("expires a stale QR when polled and never marks it paid without the gateway", async () => {
    const { employee, fee } = await employeeWithFee();
    const view = await createPaymentOrder(employee, fee.id);
    await prisma.payment.update({ where: { id: view.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const polled = await getPaymentStatus(employee, view.id);
    expect(polled.status).toBe("FAILED");
    expect(polled.qrImageUrl).toBeNull();
    expect((await prisma.parkingFee.findUniqueOrThrow({ where: { id: fee.id } })).status).toBe("DUE");

    const again = await getPaymentStatus(employee, view.id);
    expect(again.status).toBe("FAILED");
    expect(again.failureReason).toMatch(/expired/);
  });

  it("only issues receipts for successful payments", async () => {
    const { employee, fee } = await employeeWithFee();
    const view = await createPaymentOrder(employee, fee.id);
    await expect(getReceipt(employee, view.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
