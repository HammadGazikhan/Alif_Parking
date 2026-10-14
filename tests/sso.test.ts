import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resolveSsoUser } from "@/server/auth/sso";
import { entraTenantId } from "@/server/auth/entra";
import { createUser, resetDb } from "./fixtures";

const BOOTSTRAP = "hammad.g@aligconsulting.com";

describe("resolveSsoUser", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.BOOTSTRAP_ADMIN_EMAILS = `${BOOTSTRAP}, second.admin@aligconsulting.com`;
  });
  afterEach(() => {
    delete process.env.BOOTSTRAP_ADMIN_EMAILS;
  });

  it("lets a registered employee in, matching the email case-insensitively", async () => {
    const employee = await createUser("EMPLOYEE");
    const result = await resolveSsoUser(`  ${employee.email.toUpperCase()} `, "Someone");
    expect(result).toEqual({ ok: true, user: { id: employee.id, role: "EMPLOYEE" } });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: employee.id } });
    expect(row.lastLoginAt).not.toBeNull();
    expect(row.name).toBe(employee.name);
  });

  it("refuses people who were never added to the portal", async () => {
    expect(await resolveSsoUser("stranger@aligconsulting.com", "Stranger")).toEqual({ ok: false, reason: "not-registered" });
    expect(await prisma.user.count()).toBe(0);
  });

  it("refuses deactivated accounts", async () => {
    const employee = await createUser("EMPLOYEE", { status: "INACTIVE" });
    expect(await resolveSsoUser(employee.email)).toEqual({ ok: false, reason: "inactive" });
  });

  it("refuses sign-ins without an email claim", async () => {
    expect(await resolveSsoUser(undefined)).toEqual({ ok: false, reason: "no-email" });
    expect(await resolveSsoUser("   ")).toEqual({ ok: false, reason: "no-email" });
  });

  it("creates a bootstrap admin on first sign-in", async () => {
    const result = await resolveSsoUser("Hammad.G@AligConsulting.com", "Hammad G");
    expect(result.ok && result.user.role).toBe("ADMIN");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: BOOTSTRAP } });
    expect(user).toMatchObject({ name: "Hammad G", role: "ADMIN", parkingEligible: true, status: "ACTIVE" });
    expect(await prisma.auditLog.count({ where: { action: "EMPLOYEE_CREATED", entityId: BOOTSTRAP } })).toBe(1);
  });

  it("promotes an existing account listed as a bootstrap admin", async () => {
    const existing = await prisma.user.create({ data: { name: "Second", email: "second.admin@aligconsulting.com" } });
    const result = await resolveSsoUser(existing.email);
    expect(result).toEqual({ ok: true, user: { id: existing.id, role: "ADMIN" } });
  });

  it("does not let a deactivated bootstrap admin back in", async () => {
    await prisma.user.create({ data: { name: "Hammad", email: BOOTSTRAP, role: "ADMIN", status: "INACTIVE" } });
    expect(await resolveSsoUser(BOOTSTRAP)).toEqual({ ok: false, reason: "inactive" });
  });
});

describe("entraTenantId", () => {
  const original = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  afterEach(() => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER = original;
  });
  const withIssuer = (issuer: string) => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER = issuer;
    return entraTenantId();
  };

  it("accepts a single-tenant issuer", () => {
    expect(withIssuer("https://login.microsoftonline.com/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b/v2.0")).toBe(
      "0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b",
    );
  });

  it("rejects multi-tenant, placeholder and missing issuers", () => {
    expect(withIssuer("https://login.microsoftonline.com/common/v2.0")).toBeNull();
    expect(withIssuer("https://login.microsoftonline.com/organizations/v2.0")).toBeNull();
    expect(withIssuer("https://login.microsoftonline.com/<directory-tenant-id>/v2.0")).toBeNull();
    expect(withIssuer("")).toBeNull();
  });
});
