import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import type { CurrentUser } from "@/server/auth/guards";
import { computeDueDate, currentPeriod } from "@/lib/dates";

const DEFAULT_CATEGORIES = [
  { name: "Car", monthlyFee: 50000 },
  { name: "Bike", monthlyFee: 40000 },
  { name: "Scooter", monthlyFee: 40000 },
  { name: "Other", monthlyFee: 50000 },
] as const;

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await prisma.parkingSetting.create({
    data: { id: 1, dueDay: 10, lateFee: 5000, feesEnabled: true },
  });
  await prisma.vehicleCategory.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      name: category.name,
      nameKey: category.name.toLowerCase(),
      monthlyFee: category.monthlyFee,
      active: true,
    })),
  });
}

const uid = () => randomBytes(4).toString("hex").toUpperCase();

function toCurrentUser(u: { id: string; name: string; email: string; role: "ADMIN" | "EMPLOYEE" }): CurrentUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, designation: null, avatarType: null };
}

export async function createUser(
  role: "ADMIN" | "EMPLOYEE" = "EMPLOYEE",
  overrides: Partial<{ status: "ACTIVE" | "INACTIVE"; parkingEligible: boolean; freePass: boolean }> = {},
) {
  const code = `${role === "ADMIN" ? "adm" : "emp"}${uid().toLowerCase()}`;
  const user = await prisma.user.create({
    data: {
      name: `${role === "ADMIN" ? "Admin" : "Employee"} ${code}`,
      email: `${code}@company.test`,
      role,
      status: overrides.status ?? "ACTIVE",
      parkingEligible: overrides.parkingEligible ?? true,
      freePass: overrides.freePass ?? false,
    },
  });
  return toCurrentUser(user);
}

export async function categoryByName(name: string) {
  const category = await prisma.vehicleCategory.findUnique({ where: { nameKey: name.trim().toLowerCase() } });
  if (!category) throw new Error(`Missing vehicle category ${name}`);
  return category;
}

export async function createVehicle(userId: string, number = `MH${Math.floor(Math.random() * 90 + 10)}AB${Math.floor(Math.random() * 9000 + 1000)}`, categoryName = "Car") {
  const category = await categoryByName(categoryName);
  return prisma.vehicle.create({ data: { userId, number, categoryId: category.id } });
}

export async function createFee(userId: string, vehicleId: string, amount = 50000) {
  const { month, year } = currentPeriod();
  return prisma.parkingFee.create({
    data: {
      userId,
      vehicleId,
      month,
      year,
      baseAmount: amount,
      lateFee: 0,
      amount,
      status: "DUE",
      // Far enough in the future that lazy overdue marking never kicks in.
      dueDate: computeDueDate(month, year, 28),
    },
  });
}

/** An employee with a vehicle and an unpaid fee for the current month. */
export async function employeeWithFee(amount = 50000) {
  const employee = await createUser("EMPLOYEE");
  const vehicle = await createVehicle(employee.id);
  const fee = await createFee(employee.id, vehicle.id, amount);
  return { employee, vehicle, fee };
}
