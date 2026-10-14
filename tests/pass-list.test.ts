import ExcelJS from "exceljs";
import { describe, expect, it, beforeEach } from "vitest";
import { PASS_LIST_COMPANY, PASS_LIST_LOCATION, PASS_LIST_NOTES, PASS_LIST_UNIT_NO } from "@/lib/constants";
import { currentPeriod, monthName } from "@/lib/dates";
import { prisma } from "@/server/db";
import { ValidationError } from "@/server/errors";
import {
  blockStatus,
  buildPassListWorkbook,
  formatPassPhone,
  passListSheetName,
  plateDigits,
  splitName,
  vehicleTypeFor,
} from "@/server/services/pass-list.service";
import { assertPeriodHasFees, assertReportHasFees, listFeePeriods } from "@/server/services/report.service";
import { createFee, createUser, createVehicle, resetDb } from "./fixtures";

describe("pass list helpers", () => {
  it("splits a name on the first space", () => {
    expect(splitName("Farhan Qudsi")).toEqual({ first: "Farhan", last: "Qudsi" });
    expect(splitName("Aman")).toEqual({ first: "Aman", last: "" });
    expect(splitName("  Hammad Gazikhan  ")).toEqual({ first: "Hammad", last: "Gazikhan" });
  });

  it("formats a phone for the pass list", () => {
    expect(formatPassPhone(null)).toBe("");
    expect(formatPassPhone("9876543210")).toBe("91 9876543210");
    expect(formatPassPhone("+91 90282 94404")).toBe("91 9028294404");
    expect(formatPassPhone("91 98811 83835")).toBe("91 9881183835");
    expect(formatPassPhone("ext 123")).toBe("ext 123");
  });

  it("maps category names to 2W and 4W", () => {
    expect(vehicleTypeFor("Car")).toBe("4W");
    expect(vehicleTypeFor("Bike")).toBe("2W");
    expect(vehicleTypeFor("Scooter")).toBe("2W");
    expect(vehicleTypeFor("Other")).toBe("Other");
  });

  it("keeps a leading zero in the last four digits", () => {
    expect(plateDigits("MH12VH3703")).toBe(3703);
    expect(plateDigits("MH14FM0140")).toBe("0140");
    expect(plateDigits("MH14GO679")).toBe("O679");
  });

  it("colours a block from payment status", () => {
    expect(blockStatus({ freePass: true, fees: [] })).toEqual({ category: "FREE", amountPaise: 0, paymentType: "FREE" });
    expect(blockStatus({ freePass: false, fees: [{ status: "PAID", amount: 30000 }, { status: "PAID", amount: 60000 }] })).toEqual({
      category: "Y",
      amountPaise: 90000,
      paymentType: "CASH",
    });
    expect(
      blockStatus({
        freePass: false,
        fees: [
          { status: "PAID", amount: 30000 },
          { status: "DUE", amount: 60000 },
        ],
      }),
    ).toEqual({ category: "N", amountPaise: 30000, paymentType: "CASH" });
    expect(blockStatus({ freePass: false, fees: [{ status: "OVERDUE", amount: 30000 }] })).toEqual({
      category: "N",
      amountPaise: 0,
      paymentType: "CASH",
    });
  });
});

function fillOf(cell: ExcelJS.Cell): string | undefined {
  const fill = cell.fill;
  if (fill && fill.type === "pattern" && fill.fgColor && "argb" in fill.fgColor) return fill.fgColor.argb;
  return undefined;
}

describe("buildPassListWorkbook", () => {
  beforeEach(() => resetDb());

  it("writes the Clover Hills sheet for paid, unpaid and free-pass vehicles", async () => {
    const period = currentPeriod();
    const paid = await createUser();
    const unpaid = await createUser();
    const free = await createUser("EMPLOYEE", { freePass: true });
    await prisma.user.update({ where: { id: paid.id }, data: { name: "Amy Paid", phone: "9876543210" } });
    await prisma.user.update({ where: { id: unpaid.id }, data: { name: "Bea Unpaid", phone: "912345678901" } });
    await prisma.user.update({ where: { id: free.id }, data: { name: "Cara Free", phone: null } });

    const car = await createVehicle(paid.id, "MH12AB1234", "Car");
    const bike = await createVehicle(paid.id, "MH12CD5678", "Bike");
    const due = await createVehicle(unpaid.id, "MH14EF9012", "Bike");
    await createVehicle(free.id, "MH12GH0140", "Scooter");
    const paidCar = await createFee(paid.id, car.id, 60000);
    const paidBike = await createFee(paid.id, bike.id, 30000);
    await createFee(unpaid.id, due.id, 30000);
    await prisma.parkingFee.updateMany({ where: { id: { in: [paidCar.id, paidBike.id] } }, data: { status: "PAID" } });

    const buffer = await buildPassListWorkbook(period, { name: "Aman Shaikh", phone: "919028294404" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet(passListSheetName(period.month, period.year));
    expect(ws).toBeDefined();
    expect(ws!.name).toBe(`Parking ${monthName(period.month)} ${period.year}`);

    expect(ws!.getCell("C1").value).toBe(PASS_LIST_UNIT_NO);
    expect(ws!.getCell("C2").value).toBe(PASS_LIST_COMPANY);
    expect(ws!.getCell("C3").value).toBe("Aman Shaikh");
    expect(ws!.getRow(8).values).toEqual(
      expect.arrayContaining(["Sr No", "Location", "Numberplate", "Vehicle Type", "Company Name", "User Email", "Category(FREE/PAID)"]),
    );

    expect(ws!.getCell("B10").value).toBe(PASS_LIST_LOCATION);
    expect(ws!.getCell("F10").value).toBe(PASS_LIST_COMPANY);
    expect(ws!.getCell("K10").value).toBe("FREE");
    expect(ws!.getCell("L10").value).toBe(0);
    expect(ws!.getCell("M10").value).toBe("FREE");
    expect(ws!.getCell("C10").value).toBe("MH12GH0140");
    expect(ws!.getCell("D10").value).toBe("0140");
    expect(fillOf(ws!.getCell("B10"))).toBe("FFFFFF00");

    expect(ws!.getCell("C11").value).toBe("MH12AB1234");
    expect(ws!.getCell("E11").value).toBe("4W");
    expect(ws!.getCell("C12").value).toBe("MH12CD5678");
    expect(ws!.getCell("E12").value).toBe("2W");
    expect(ws!.getCell("K11").value).toBe("Y");
    expect(ws!.getCell("L11").value).toBe(900);
    expect(ws!.getCell("M11").value).toBe("CASH");
    expect(fillOf(ws!.getCell("H11"))).toBe("FFA9D08E");

    expect(String(ws!.model.merges ?? [])).toContain("A11:A12");

    expect(ws!.getCell("K13").value).toBe("N");
    expect(ws!.getCell("L13").value).toBe(0);
    expect(fillOf(ws!.getCell("B13"))).toBe("FFFF0000");

    const total = ws!.getCell("L16");
    expect(total.formula || (typeof total.value === "object" && total.value && "formula" in total.value ? total.value.formula : "")).toBe(
      "SUM(L10:L13)",
    );
    expect(ws!.getCell("K16").value).toBe("Total");
    expect(ws!.getCell("C18").value).toBe("Note:");
    expect(ws!.getCell("C19").value).toBe(PASS_LIST_NOTES[0]);
  });
});

describe("fee month export guard", () => {
  beforeEach(() => resetDb());

  it("lists only months that have fees and rejects the rest", async () => {
    const period = currentPeriod();
    const user = await createUser();
    const vehicle = await createVehicle(user.id);
    await createFee(user.id, vehicle.id);

    await expect(listFeePeriods()).resolves.toEqual([period]);
    await expect(assertPeriodHasFees(period.month, period.year)).resolves.toBeUndefined();
    await expect(assertPeriodHasFees(period.month === 1 ? 12 : period.month - 1, period.month === 1 ? period.year - 1 : period.year)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(assertReportHasFees({ from: "1999-01", to: "1999-02" })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      assertReportHasFees({ from: `${period.year}-${String(period.month).padStart(2, "0")}`, to: `${period.year}-${String(period.month).padStart(2, "0")}` }),
    ).resolves.toBeUndefined();
  });
});
