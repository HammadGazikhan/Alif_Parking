import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeVehicleNumber } from "../src/lib/vehicle";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const LATE_FEE = 5000;
const DUE_DAY = 10;
const CATEGORIES = [
  { name: "Car", monthlyFee: 30000 },
  { name: "Bike", monthlyFee: 15000 },
  { name: "Scooter", monthlyFee: 15000 },
  { name: "Other", monthlyFee: 50000 },
] as const;
type CategoryName = (typeof CATEGORIES)[number]["name"];

const ADMIN_EMAILS = (process.env.BOOTSTRAP_ADMIN_EMAILS || "hammad.g@alifconsulting.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const PASS_LIST_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "data/parking-october-2026.xlsx");

function nameFromEmail(email: string) {
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return "";
  if ("text" in value && value.text) return String(value.text).replace(/\s+/g, " ").trim();
  if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  if ("result" in value && value.result != null && typeof value.result !== "object") return String(value.result).trim();
  return "";
}

type PassVehicle = { number: string; category: "Car" | "Bike" };
type PassEmployee = {
  name: string;
  email: string;
  phone: string | null;
  freePass: boolean;
  vehicles: PassVehicle[];
};

/** People and vehicles from the Clover Hills pass list, in sheet order. */
async function readPassList(file = PASS_LIST_FILE): Promise<PassEmployee[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No sheet in ${file}`);

  const people = new Map<string, PassEmployee>();
  let carried: { email: string; name: string; phone: string | null; freePass: boolean } | null = null;

  for (let r = 10; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const category = cellText(row.getCell(11).value).toUpperCase();
    if (category === "TOTAL") break;

    const plateRaw = cellText(row.getCell(3).value);
    const email = cellText(row.getCell(7).value).replace(/\s+/g, "").toLowerCase();
    if (!plateRaw && !email) {
      if (people.size > 0) break;
      continue;
    }
    if (!plateRaw) continue;

    if (email) {
      const name = `${cellText(row.getCell(8).value)} ${cellText(row.getCell(9).value)}`.replace(/\s+/g, " ").trim();
      const phone = cellText(row.getCell(10).value);
      carried = {
        email,
        name: (name || email).slice(0, 100),
        phone: phone || null,
        freePass: category === "FREE",
      };
    }
    if (!carried) continue;

    const number = normalizeVehicleNumber(plateRaw);
    if (!number) continue;
    const vehicleCategory: "Car" | "Bike" = cellText(row.getCell(5).value).toUpperCase() === "4W" ? "Car" : "Bike";

    let person = people.get(carried.email);
    if (!person) {
      person = {
        name: carried.name,
        email: carried.email,
        phone: carried.phone,
        freePass: carried.freePass,
        vehicles: [],
      };
      people.set(carried.email, person);
    }
    if (!person.vehicles.some((vehicle) => vehicle.number === number)) {
      person.vehicles.push({ number, category: vehicleCategory });
    }
  }

  return [...people.values()];
}

async function main() {
  console.log("Seeding Alif Parking Portal…");
  const passList = await readPassList();

  await prisma.$transaction([
    prisma.webhookEvent.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.parkingFee.deleteMany(),
    prisma.vehicle.deleteMany(),
    prisma.vehicleCategory.deleteMany(),
    prisma.parkingSetting.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const passByEmail = new Map(passList.map((person) => [person.email, person]));
  const adminUsers = [];
  for (const email of ADMIN_EMAILS) {
    const person = passByEmail.get(email);
    adminUsers.push(
      await prisma.user.create({
        data: {
          name: person?.name || nameFromEmail(email),
          email,
          phone: person?.phone ?? null,
          role: "ADMIN",
          parkingEligible: true,
          freePass: person?.freePass ?? false,
        },
      }),
    );
  }
  const admin = adminUsers[0];
  if (!admin) throw new Error("Set BOOTSTRAP_ADMIN_EMAILS before seeding.");

  await prisma.parkingSetting.create({
    data: { id: 1, dueDay: DUE_DAY, lateFee: LATE_FEE, feesEnabled: true, updatedById: admin.id },
  });

  const categories = new Map<CategoryName, string>();
  for (const category of CATEGORIES) {
    const created = await prisma.vehicleCategory.create({
      data: { name: category.name, nameKey: category.name.toLowerCase(), monthlyFee: category.monthlyFee, active: true },
    });
    categories.set(category.name, created.id);
  }

  const admins = new Set(ADMIN_EMAILS);
  const usedNumbers = new Set<string>();
  let employees = 0;
  let vehicles = 0;
  let freePasses = 0;

  for (const person of passList) {
    const existingAdmin = admins.has(person.email) ? adminUsers.find((user) => user.email === person.email) : undefined;
    const user =
      existingAdmin ??
      (await prisma.user.create({
        data: {
          name: person.name,
          email: person.email,
          phone: person.phone,
          role: "EMPLOYEE",
          status: "ACTIVE",
          parkingEligible: true,
          freePass: person.freePass,
        },
      }));
    employees += 1;
    if (person.freePass) freePasses += 1;

    if (!existingAdmin) await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "EMPLOYEE_CREATED",
        entityType: "Employee",
        entityId: person.email,
        description: `Created employee ${person.name}`,
      },
    });

    for (const vehicle of person.vehicles) {
      if (usedNumbers.has(vehicle.number)) {
        console.log(`Skipped duplicate vehicle ${vehicle.number} for ${person.email}`);
        continue;
      }
      usedNumbers.add(vehicle.number);
      await prisma.vehicle.create({
        data: {
          userId: user.id,
          number: vehicle.number,
          categoryId: categories.get(vehicle.category)!,
          status: "ACTIVE",
        },
      });
      vehicles += 1;
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "SETTINGS_UPDATED",
      entityType: "ParkingSetting",
      entityId: "1",
      description: "Updated parking settings",
      metadata: { after: { dueDay: DUE_DAY, lateFee: LATE_FEE, feesEnabled: true } },
    },
  });

  console.log(`Seeded ${employees} employees (${freePasses} free pass), ${vehicles} vehicles, plus ${ADMIN_EMAILS.length} admin account(s).`);
  console.log(`Admins (sign in with Microsoft): ${ADMIN_EMAILS.join(", ")}`);
  console.log("No monthly fees were created. Generate them from Parking fees.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
