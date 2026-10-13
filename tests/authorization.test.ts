import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { createUser, employeeWithFee, resetDb } from "./fixtures";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string } } }));

vi.mock("@/server/auth", () => ({
  auth: vi.fn(async () => session.current),
}));

const employeesRoute = await import("@/app/api/employees/route");
const generateRoute = await import("@/app/api/parking-fees/generate/route");
const settingsRoute = await import("@/app/api/settings/parking/route");
const createOrderRoute = await import("@/app/api/payments/create-order/route");
const paymentsRoute = await import("@/app/api/payments/route");

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);
const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("API authorization", () => {
  beforeEach(async () => {
    await resetDb();
    session.current = null;
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await employeesRoute.GET(req("/api/employees"), undefined);
    expect(res.status).toBe(401);
  });

  it("forbids employees from admin APIs", async () => {
    const employee = await createUser("EMPLOYEE");
    session.current = { user: { id: employee.id, role: "EMPLOYEE" } };

    expect((await employeesRoute.GET(req("/api/employees"), undefined)).status).toBe(403);
    expect((await generateRoute.POST(req("/api/parking-fees/generate", json({ month: 1, year: 2031 })), undefined)).status).toBe(403);
    expect((await settingsRoute.GET(req("/api/settings/parking"), undefined)).status).toBe(403);
    expect(await prisma.parkingFee.count()).toBe(0);
  });

  it("derives the role from the database, not the session token", async () => {
    const employee = await createUser("EMPLOYEE");
    // A forged/stale token claiming ADMIN must not grant admin access.
    session.current = { user: { id: employee.id, role: "ADMIN" } };
    expect((await employeesRoute.GET(req("/api/employees"), undefined)).status).toBe(403);
  });

  it("locks out deactivated users immediately", async () => {
    const admin = await createUser("ADMIN", { status: "INACTIVE" });
    session.current = { user: { id: admin.id, role: "ADMIN" } };
    expect((await employeesRoute.GET(req("/api/employees"), undefined)).status).toBe(401);
  });

  it("allows admins", async () => {
    const admin = await createUser("ADMIN");
    session.current = { user: { id: admin.id, role: "ADMIN" } };
    expect((await employeesRoute.GET(req("/api/employees"), undefined)).status).toBe(200);
  });

  it("ignores a client-sent amount when creating an order via the API", async () => {
    const { employee, fee } = await employeeWithFee(50000);
    session.current = { user: { id: employee.id, role: "EMPLOYEE" } };
    const res = await createOrderRoute.POST(
      req("/api/payments/create-order", json({ feeId: fee.id, amount: 1, userId: "x", currency: "USD" })),
      undefined,
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.amount).toBe(50000);
    expect(data.currency).toBe("INR");
  });

  it("scopes the payments list to the signed-in employee", async () => {
    const a = await employeeWithFee();
    const b = await employeeWithFee();
    for (const ctx of [a, b]) {
      session.current = { user: { id: ctx.employee.id, role: "EMPLOYEE" } };
      await createOrderRoute.POST(req("/api/payments/create-order", json({ feeId: ctx.fee.id })), undefined);
    }
    session.current = { user: { id: a.employee.id, role: "EMPLOYEE" } };
    const res = await paymentsRoute.GET(req("/api/payments"), undefined);
    const { data } = await res.json();
    expect(data.total).toBe(1);
    expect(data.items[0].parkingFee.userId).toBe(a.employee.id);
    expect(data.items[0].rawPayload).toBeUndefined();
  });
});
