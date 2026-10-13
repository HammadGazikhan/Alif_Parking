import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { buildMockWebhook } from "@/server/payments/mock";
import { hmacSha256Hex } from "@/server/payments/signature";
import { createPaymentOrder } from "@/server/services/payment.service";
import { processWebhook } from "@/server/services/webhook.service";
import { employeeWithFee, resetDb } from "./fixtures";

async function pendingPayment(amount = 50000) {
  const ctx = await employeeWithFee(amount);
  const view = await createPaymentOrder(ctx.employee, ctx.fee.id);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: view.id } });
  return { ...ctx, payment };
}

describe("payment webhook", () => {
  beforeEach(resetDb);

  it("settles a verified payment: payment SUCCESS, fee PAID, employee notified, audited", async () => {
    const { payment, fee, employee } = await pendingPayment();
    const event = buildMockWebhook({ qrCodeId: payment.qrCodeId!, amount: payment.amount, outcome: "success", paymentRef: payment.id });

    const res = await processWebhook(event.body, event.headers);
    expect(res).toEqual({ status: 200, body: { received: true, result: "settled" } });

    const [p, f] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      prisma.parkingFee.findUniqueOrThrow({ where: { id: fee.id } }),
    ]);
    expect(p.status).toBe("SUCCESS");
    expect(p.paymentId).toBe(event.gatewayPaymentId);
    expect(f.status).toBe("PAID");
    expect(f.paidAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { userId: employee.id, type: "PAYMENT_SUCCESS" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "PAYMENT_STATUS_CHANGED", entityId: payment.id } })).toBe(1);
  });

  it("processes a replayed webhook exactly once", async () => {
    const { payment, employee } = await pendingPayment();
    const event = buildMockWebhook({ qrCodeId: payment.qrCodeId!, amount: payment.amount, outcome: "success", paymentRef: payment.id });

    const first = await processWebhook(event.body, event.headers);
    const replay = await processWebhook(event.body, event.headers);
    expect(first.body.result).toBe("settled");
    expect(replay).toEqual({ status: 200, body: { received: true, result: "duplicate" } });

    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(await prisma.payment.count({ where: { status: "SUCCESS" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: employee.id, type: "PAYMENT_SUCCESS" } })).toBe(1);
  });

  it("handles concurrent duplicate deliveries safely", async () => {
    const { payment, employee } = await pendingPayment();
    const event = buildMockWebhook({ qrCodeId: payment.qrCodeId!, amount: payment.amount, outcome: "success", paymentRef: payment.id });

    const results = await Promise.all(Array.from({ length: 5 }, () => processWebhook(event.body, event.headers)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.result === "settled")).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: employee.id, type: "PAYMENT_SUCCESS" } })).toBe(1);
  });

  it("treats a different event for an already-settled payment as a no-op", async () => {
    const { payment } = await pendingPayment();
    const a = buildMockWebhook({ qrCodeId: payment.qrCodeId!, amount: payment.amount, outcome: "success", paymentRef: payment.id });
    const b = buildMockWebhook({ qrCodeId: payment.qrCodeId!, amount: payment.amount, outcome: "success", paymentRef: payment.id });
    await processWebhook(a.body, a.headers);
    const res = await processWebhook(b.body, b.headers);
    expect(res.body.result).toBe("already_processed");
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(p.paymentId).toBe(a.gatewayPaymentId);
  });

  it("rejects an invalid signature with 401 and changes nothing", async () => {
    const { payment, fee } = await pendingPayment();
    const event = buildMockWebhook({ qrCodeId: payment.qrCodeId!, amount: payment.amount, outcome: "success", paymentRef: payment.id });
    const forged = new Headers(event.headers);
    forged.set("x-mock-signature", hmacSha256Hex("wrong-secret", event.body));

    const res = await processWebhook(event.body, forged);
    expect(res.status).toBe(401);

    const tampered = event.body.replace(`"amount":${payment.amount}`, `"amount":${payment.amount + 1}`);
    expect((await processWebhook(tampered, event.headers)).status).toBe(401);

    expect(await prisma.webhookEvent.count()).toBe(0);
    expect((await prisma.parkingFee.findUniqueOrThrow({ where: { id: fee.id } })).status).toBe("DUE");
  });

  it("rejects requests without any gateway signature", async () => {
    const res = await processWebhook('{"event":"qr_code.credited"}', new Headers({ "content-type": "application/json" }));
    expect(res.status).toBe(401);
  });

  it("does not mark the fee paid when the received amount differs", async () => {
    const { payment, fee } = await pendingPayment(50000);
    const event = buildMockWebhook({ qrCodeId: payment.qrCodeId!, amount: 100, outcome: "success", paymentRef: payment.id });

    const res = await processWebhook(event.body, event.headers);
    expect(res.body.result).toBe("amount_mismatch");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("FAILED");
    expect((await prisma.parkingFee.findUniqueOrThrow({ where: { id: fee.id } })).status).toBe("DUE");
  });

  it("records failed payments without touching the fee", async () => {
    const { payment, fee, employee } = await pendingPayment();
    const event = buildMockWebhook({ qrCodeId: payment.qrCodeId!, amount: payment.amount, outcome: "failed", paymentRef: payment.id });

    const res = await processWebhook(event.body, event.headers);
    expect(res.body.result).toBe("failed");
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(p.status).toBe("FAILED");
    expect(p.failureReason).toMatch(/declined/i);
    expect((await prisma.parkingFee.findUniqueOrThrow({ where: { id: fee.id } })).status).toBe("DUE");
    expect(await prisma.notification.count({ where: { userId: employee.id, type: "PAYMENT_FAILED" } })).toBe(1);
  });

  it("flags a second successful payment for the same fee as refund-required", async () => {
    const { payment: first, fee, employee } = await pendingPayment();
    // Expire the first QR so a new one is issued, then both get paid.
    await prisma.payment.update({ where: { id: first.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const secondView = await createPaymentOrder(employee, fee.id);
    const second = await prisma.payment.findUniqueOrThrow({ where: { id: secondView.id } });
    expect(second.id).not.toBe(first.id);

    const e2 = buildMockWebhook({ qrCodeId: second.qrCodeId!, amount: second.amount, outcome: "success", paymentRef: second.id });
    const e1 = buildMockWebhook({ qrCodeId: first.qrCodeId!, amount: first.amount, outcome: "success", paymentRef: first.id });
    expect((await processWebhook(e2.body, e2.headers)).body.result).toBe("settled");
    expect((await processWebhook(e1.body, e1.headers)).body.result).toBe("refund_required");

    expect(await prisma.payment.count({ where: { parkingFeeId: fee.id, status: "SUCCESS" } })).toBe(1);
    const late = await prisma.payment.findUniqueOrThrow({ where: { id: first.id } });
    expect(late.failureReason).toMatch(/refund required/);
  });

  it("allows at most one SUCCESS payment per fee at the database level", async () => {
    const { fee } = await employeeWithFee();
    const base = { parkingFeeId: fee.id, provider: "MOCK" as const, amount: fee.amount, status: "SUCCESS" as const };
    await prisma.payment.create({ data: { ...base, orderId: "order_a" } });
    await expect(prisma.payment.create({ data: { ...base, orderId: "order_b" } })).rejects.toMatchObject({ code: "P2002" });
  });
});
