import "server-only";
import type { Prisma, UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { logAudit } from "@/server/services/audit.service";
import { tryEnsureCurrentPeriodFees } from "@/server/services/fee-generation.service";
import { paginate, skipTake } from "@/server/services/pagination";
import { ConflictError, NotFoundError, ValidationError, isUniqueConstraintError } from "@/server/errors";
import { directoryPhotoForEmail, excludeRegistered, searchDirectoryUsers, type DirectoryPerson } from "@/server/directory/graph";
import type { CurrentUser } from "@/server/auth/guards";
import { ROSTER_ROLES } from "@/lib/constants";
import type { EmployeeCreateInput, EmployeeListQuery, EmployeeUpdateInput } from "@/lib/validations/employee";

const DIRECTORY_RESULT_LIMIT = 20;

const employeeListSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  designation: true,
  avatarType: true,
  role: true,
  status: true,
  parkingEligible: true,
  freePass: true,
  lastLoginAt: true,
  createdAt: true,
  vehicles: {
    where: { status: "ACTIVE" },
    select: { id: true, number: true, category: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.UserSelect;

export type EmployeeListItem = Prisma.UserGetPayload<{ select: typeof employeeListSelect }>;

export async function listEmployees(query: EmployeeListQuery) {
  const where: Prisma.UserWhereInput = {
    role: { in: [...ROSTER_ROLES] },
    ...(query.status ? { status: query.status } : {}),
    ...(query.parkingEligible !== undefined ? { parkingEligible: query.parkingEligible } : {}),
    ...(query.hasVehicle === true ? { vehicles: { some: { status: "ACTIVE" } } } : {}),
    ...(query.hasVehicle === false ? { vehicles: { none: { status: "ACTIVE" } } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { vehicles: { some: { number: { contains: query.search.replace(/\s/g, ""), mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: employeeListSelect,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      ...skipTake(query),
    }),
    prisma.user.count({ where }),
  ]);
  return paginate(items, total, query);
}

export async function listEmployeeOptions() {
  return prisma.user.findMany({
    where: { role: { in: [...ROSTER_ROLES] } },
    select: { id: true, name: true, email: true, status: true },
    orderBy: { name: "asc" },
  });
}

export async function getEmployee(id: string) {
  const employee = await prisma.user.findFirst({
    where: { id, role: { in: [...ROSTER_ROLES] } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      designation: true,
      avatarType: true,
      role: true,
      status: true,
      parkingEligible: true,
      freePass: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      vehicles: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        include: { category: { select: { id: true, name: true } } },
      },
      parkingFees: {
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 12,
        include: {
          vehicle: { select: { number: true } },
          payments: {
            where: { status: "SUCCESS" },
            select: { id: true, paymentId: true, paidAt: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!employee) throw new NotFoundError("Employee");
  return employee;
}

/** Microsoft directory people who do not have a portal account yet (admins included). */
export async function searchUnregisteredDirectoryPeople(search: string): Promise<DirectoryPerson[]> {
  const people = await searchDirectoryUsers(search);
  if (people.length === 0) return [];
  const candidates = Array.from(new Set(people.flatMap((p) => [p.email, p.upn])));
  const registered = await prisma.user.findMany({
    where: { email: { in: candidates } },
    select: { email: true },
  });
  return excludeRegistered(
    people,
    registered.map((u) => u.email),
  ).slice(0, DIRECTORY_RESULT_LIMIT);
}

const EMAIL_IN_USE = "This person already has a portal account";

function mapUniqueError(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new ConflictError("An account with this email already exists.", { email: EMAIL_IN_USE });
  }
  throw error;
}

export async function createEmployee(actor: CurrentUser, input: EmployeeCreateInput) {
  const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (clash) throw new ConflictError("An account with this email already exists.", { email: EMAIL_IN_USE });

  const photo = input.directoryId ? await directoryPhotoForEmail(input.directoryId, input.email) : null;

  try {
    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          designation: input.designation || null,
          ...(photo ? { avatar: photo.bytes, avatarType: photo.contentType } : {}),
          parkingEligible: input.parkingEligible,
          freePass: input.freePass,
          status: input.status,
          role: "EMPLOYEE",
        },
        select: { id: true, name: true, email: true },
      });
      await logAudit(
        {
          actorId: actor.id,
          action: "EMPLOYEE_CREATED",
          entityType: "Employee",
          entityId: created.email,
          description: `Created employee ${created.name}`,
          metadata: { userId: created.id },
        },
        tx,
      );
      return created;
    });
    return { employee };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function updateEmployee(actor: CurrentUser, id: string, input: EmployeeUpdateInput) {
  const existing = await prisma.user.findFirst({ where: { id, role: { in: [...ROSTER_ROLES] } } });
  if (!existing) throw new NotFoundError("Employee");

  const demoting = input.role === "EMPLOYEE" && existing.role === "ADMIN";
  if (demoting && id === actor.id) {
    throw new ValidationError("You cannot remove your own administrator access.", {
      role: "You cannot remove your own administrator access.",
    });
  }
  if (demoting) {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) {
      throw new ValidationError("The last administrator cannot be demoted.", {
        role: "The last administrator cannot be demoted.",
      });
    }
  }

  const data: Prisma.UserUpdateInput = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
    ...(input.designation !== undefined ? { designation: input.designation || null } : {}),
    ...(input.parkingEligible !== undefined ? { parkingEligible: input.parkingEligible } : {}),
    ...(input.freePass !== undefined ? { freePass: input.freePass } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
  };

  const changed = Object.keys(data).filter(
    (k) => (existing as Record<string, unknown>)[k] !== (data as Record<string, unknown>)[k],
  );

  const result: { id: string; name: string; email: string; role: "ADMIN" | "EMPLOYEE"; status: UserStatus; parkingEligible: boolean; freePass: boolean } =
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: { id: true, name: true, email: true, role: true, status: true, parkingEligible: true, freePass: true },
      });
      const statusChanged = input.status !== undefined && input.status !== existing.status;
      const roleChanged = input.role !== undefined && input.role !== existing.role;
      await logAudit(
        {
          actorId: actor.id,
          action: statusChanged
            ? input.status === "ACTIVE"
              ? "EMPLOYEE_ACTIVATED"
              : "EMPLOYEE_DEACTIVATED"
            : "EMPLOYEE_UPDATED",
          entityType: "Employee",
          entityId: updated.email,
          description: roleChanged
            ? input.role === "ADMIN"
              ? `Granted administrator access to ${updated.name}`
              : `Removed administrator access from ${updated.name}`
            : statusChanged
              ? `${input.status === "ACTIVE" ? "Activated" : "Deactivated"} employee ${updated.name}`
              : `Updated employee ${updated.name}`,
          metadata: { userId: id, fields: changed },
        },
        tx,
      );
      return updated;
    });

  const becameBillable =
    (changed.includes("status") || changed.includes("parkingEligible") || changed.includes("freePass")) &&
    result.status === "ACTIVE" &&
    result.parkingEligible &&
    !result.freePass;
  const billing = becameBillable ? await tryEnsureCurrentPeriodFees(actor, { userId: id }) : null;
  return { ...result, feeCreatedFor: billing?.created ? billing.period : null };
}

export async function setEmployeeStatus(actor: CurrentUser, id: string, status: "ACTIVE" | "INACTIVE") {
  if (id === actor.id) throw new ValidationError("You cannot change your own status.");
  return updateEmployee(actor, id, { status });
}
