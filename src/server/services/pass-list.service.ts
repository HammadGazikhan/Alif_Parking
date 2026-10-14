import "server-only";
import ExcelJS from "exceljs";
import { PASS_LIST_COMPANY, PASS_LIST_LOCATION, PASS_LIST_NOTES, PASS_LIST_UNIT_NO } from "@/lib/constants";
import { monthName } from "@/lib/dates";
import { paiseToRupees } from "@/lib/money";
import { prisma } from "@/server/db";

const YELLOW = "FFFFFF00";
const RED = "FFFF0000";
const GREEN = "FFA9D08E";
const BLUE = "FFB4C6E7";
const ORANGE = "FFFFC000";

const COLUMN_WIDTHS = [
  9.140625, 17.5703125, 23.5703125, 16.28515625, 16.140625, 25.5703125, 20.7109375, 14.85546875, 9.140625, 15,
  9.5703125, 9.140625, 12.85546875,
];

const THIN = { style: "thin" as const };
const BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const MERGE_COLUMNS = ["A", "B", "F", "G", "H", "I", "J", "K", "L", "M"] as const;

export type PassBlock = {
  freePass: boolean;
  fees: { status: string; amount: number }[];
};

export function splitName(name: string): { first: string; last: string } {
  const trimmed = name.trim();
  const space = trimmed.indexOf(" ");
  if (space === -1) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, space), last: trimmed.slice(space + 1).trim() };
}

/** `91 9876543210` when the number is a 10-digit mobile or already includes 91. */
export function formatPassPhone(phone: string | null | undefined): string {
  if (!phone?.trim()) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91 ${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `91 ${digits.slice(2)}`;
  return phone.trim();
}

export function vehicleTypeFor(categoryName: string): string {
  const name = categoryName.toLowerCase();
  if (name === "car") return "4W";
  if (name === "bike" || name === "scooter") return "2W";
  return categoryName;
}

/** Last four characters. Leading zero stays text so Excel does not drop it. */
export function plateDigits(number: string): string | number {
  const last4 = number.slice(-4);
  if (!/^\d{4}$/.test(last4) || last4.startsWith("0")) return last4;
  return Number(last4);
}

export function blockStatus(input: PassBlock): { category: "FREE" | "Y" | "N"; amountPaise: number; paymentType: "FREE" | "CASH" } {
  if (input.freePass) return { category: "FREE", amountPaise: 0, paymentType: "FREE" };
  const paid = input.fees.filter((fee) => fee.status === "PAID").reduce((sum, fee) => sum + fee.amount, 0);
  const unpaid = input.fees.some((fee) => fee.status === "DUE" || fee.status === "OVERDUE");
  if (unpaid || input.fees.length === 0) return { category: "N", amountPaise: paid, paymentType: "CASH" };
  return { category: "Y", amountPaise: paid, paymentType: "CASH" };
}

export function passListSheetName(month: number, year: number): string {
  return `Parking ${monthName(month)} ${year}`.slice(0, 31);
}

type VehicleLine = { number: string; categoryName: string };
type Block = PassBlock & {
  name: string;
  email: string;
  phone: string | null;
  vehicles: VehicleLine[];
};

function paint(
  cell: ExcelJS.Cell,
  options: { bold?: boolean; size?: number; font?: string; fill?: string; align?: Partial<ExcelJS.Alignment> } = {},
) {
  cell.font = { name: options.font ?? "Calibri", size: options.size ?? 11, bold: options.bold ?? false };
  cell.border = BORDER;
  cell.alignment = { vertical: "middle", ...options.align };
  if (options.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.fill } };
}

function dataFill(category: "FREE" | "Y" | "N", column: number): string | undefined {
  if (category === "FREE" && column >= 2) return YELLOW;
  if (category === "N" && column >= 2) return RED;
  if (category === "Y" && (column === 8 || column === 9)) return GREEN;
  return undefined;
}

function dataAlign(column: number): Partial<ExcelJS.Alignment> {
  if (column === 2 || column === 7) return { horizontal: "left" };
  return { horizontal: "center" };
}

async function loadBlocks(month: number, year: number): Promise<Block[]> {
  const [fees, freeUsers] = await Promise.all([
    prisma.parkingFee.findMany({
      where: { month, year, status: { not: "CANCELLED" } },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, freePass: true } },
        vehicle: { select: { number: true, category: { select: { name: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "EMPLOYEE"] }, status: "ACTIVE", freePass: true, vehicles: { some: { status: "ACTIVE" } } },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        vehicles: {
          where: { status: "ACTIVE" },
          select: { number: true, category: { select: { name: true } } },
          orderBy: { number: "asc" },
        },
      },
    }),
  ]);

  const blocks = new Map<string, Block>();
  for (const fee of fees) {
    if (fee.user.freePass) continue;
    const block = blocks.get(fee.userId) ?? {
      name: fee.user.name,
      email: fee.user.email,
      phone: fee.user.phone,
      freePass: false,
      vehicles: [],
      fees: [],
    };
    block.fees.push({ status: fee.status, amount: fee.amount });
    if (!block.vehicles.some((vehicle) => vehicle.number === fee.vehicle.number)) {
      block.vehicles.push({ number: fee.vehicle.number, categoryName: fee.vehicle.category.name });
    }
    blocks.set(fee.userId, block);
  }

  for (const user of freeUsers) {
    blocks.set(user.id, {
      name: user.name,
      email: user.email,
      phone: user.phone,
      freePass: true,
      fees: [],
      vehicles: user.vehicles.map((vehicle) => ({ number: vehicle.number, categoryName: vehicle.category.name })),
    });
  }

  return [...blocks.values()]
    .filter((block) => block.vehicles.length > 0)
    .sort((a, b) => Number(b.freePass) - Number(a.freePass) || a.name.localeCompare(b.name, "en"))
    .map((block) => ({ ...block, vehicles: [...block.vehicles].sort((a, b) => a.number.localeCompare(b.number)) }));
}

function writeHeader(ws: ExcelJS.Worksheet, admin: { name: string; phone: string | null }) {
  const pairs: [string, string][] = [
    ["Office/Unit No:", PASS_LIST_UNIT_NO],
    ["Office/Unit Name:", PASS_LIST_COMPANY],
    ["Admin Name:", admin.name],
    ["Admin/Contact:", formatPassPhone(admin.phone)],
  ];
  pairs.forEach(([label, value], index) => {
    const row = index + 1;
    const labelCell = ws.getCell(row, 2);
    labelCell.value = label;
    paint(labelCell, { align: { horizontal: "left" } });
    const valueCell = ws.getCell(row, 3);
    valueCell.value = value;
    paint(valueCell, { bold: true, fill: YELLOW, align: { horizontal: "center" } });
  });

  ws.mergeCells("A7:B7");
  ws.mergeCells("F7:G7");
  ws.getCell("A7").value = "CHP Pass LIST";
  ws.getCell("C7").value = "Office/Unit No:";
  ws.getCell("E7").value = "Office/Unit Name:";
  ws.getCell("H7").value = "Admin/Contact:";
  for (let column = 1; column <= 8; column++) {
    paint(ws.getCell(7, column), { bold: true, fill: BLUE, align: { horizontal: "center" } });
  }

  const headers = [
    "Sr No",
    "Location",
    "Numberplate",
    "NumberplateDigits",
    "Vehicle Type",
    "Company Name",
    "User Email",
    "User FirstName",
    "User LastName",
    "User Phone",
    "Category(FREE/PAID)",
    "",
    "Payment Type",
  ];
  headers.forEach((header, index) => {
    const cell = ws.getCell(8, index + 1);
    if (index === 11) cell.value = { formula: "SUM(L:L)" };
    else cell.value = header;
    paint(cell, { bold: true, align: { horizontal: index === 6 ? "left" : "center" } });
  });

  const subheaders: [number, string, boolean][] = [
    [7, "(VEHICLE OWNER EMAIL ID)", true],
    [10, "(FOR SMS)", true],
    [13, "CASH/OTHER", false],
  ];
  for (const [column, text, bold] of subheaders) {
    const cell = ws.getCell(9, column);
    cell.value = text;
    paint(cell, { bold, align: { horizontal: column === 7 ? "left" : "center" } });
  }
}

function writeBlock(ws: ExcelJS.Worksheet, startRow: number, block: Block) {
  const status = blockStatus(block);
  const { first, last } = splitName(block.name);
  const phone = formatPassPhone(block.phone);
  const shared: Record<number, ExcelJS.CellValue> = {
    2: PASS_LIST_LOCATION,
    6: PASS_LIST_COMPANY,
    7: { text: block.email, hyperlink: `mailto:${block.email}` },
    8: first,
    9: last,
    10: phone,
    11: status.category,
    12: paiseToRupees(status.amountPaise),
    13: status.paymentType,
  };

  block.vehicles.forEach((vehicle, index) => {
    const row = startRow + index;
    const serial = ws.getCell(row, 1);
    if (index === 0) {
      serial.value = {
        formula: `IF(COUNTA(B${row}:B${row})=0,"",ROWS($A$10:A${row})-SUM(--(B$10:B${row}="")))`,
      };
    }
    paint(serial, { font: "Arial Unicode MS", size: 10, align: { horizontal: "center" } });

    for (let column = 2; column <= 13; column++) {
      const cell = ws.getCell(row, column);
      if (column === 3) cell.value = vehicle.number;
      else if (column === 4) cell.value = plateDigits(vehicle.number);
      else if (column === 5) cell.value = vehicleTypeFor(vehicle.categoryName);
      else if (index === 0 && column in shared) cell.value = shared[column];
      const bold = column >= 3 && column !== 7;
      paint(cell, {
        bold,
        fill: dataFill(status.category, column),
        align: dataAlign(column),
      });
    }
  });

  const endRow = startRow + block.vehicles.length - 1;
  if (endRow > startRow) {
    for (const column of MERGE_COLUMNS) ws.mergeCells(`${column}${startRow}:${column}${endRow}`);
  }
  return endRow + 1;
}

function writeFooter(ws: ExcelJS.Worksheet, lastDataRow: number) {
  const sumEnd = Math.max(lastDataRow, 10);
  const totalRow = Math.max(lastDataRow, 9) + 3;
  const totalLabel = ws.getCell(totalRow, 11);
  totalLabel.value = "Total";
  paint(totalLabel, { bold: true, fill: ORANGE, align: { horizontal: "center" } });
  const totalAmount = ws.getCell(totalRow, 12);
  totalAmount.value = { formula: `SUM(L10:L${sumEnd})` };
  paint(totalAmount, { bold: true, align: { horizontal: "center" } });
  const totalType = ws.getCell(totalRow, 13);
  totalType.value = "CASH";
  paint(totalType, { bold: true, align: { horizontal: "center" } });

  const noteRow = totalRow + 2;
  const note = ws.getCell(noteRow, 3);
  note.value = "Note:";
  note.font = { name: "Calibri", size: 11, bold: true };

  PASS_LIST_NOTES.forEach((text, index) => {
    const row = noteRow + 1 + index;
    const number = ws.getCell(row, 2);
    number.value = index + 1;
    number.font = { name: "Calibri", size: 11 };
    const body = ws.getCell(row, 3);
    body.value = text;
    body.font = { name: "Calibri", size: 11 };
  });

  if (lastDataRow >= 10) {
    // exceljs writes duplicateValues, but its rule type list omits it.
    ws.addConditionalFormatting({
      ref: `C10:C${lastDataRow}`,
      rules: [
        {
          type: "duplicateValues",
          priority: 1,
          style: {
            fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } },
            font: { color: { argb: "FF9C0006" } },
          },
        },
      ],
    } as unknown as Parameters<typeof ws.addConditionalFormatting>[0]);
  }
}

export async function buildPassListWorkbook(
  period: { month: number; year: number },
  admin: { name: string; phone: string | null },
): Promise<Buffer> {
  const blocks = await loadBlocks(period.month, period.year);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Alif Parking Portal";
  wb.created = new Date();
  const ws = wb.addWorksheet(passListSheetName(period.month, period.year));
  COLUMN_WIDTHS.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });

  writeHeader(ws, admin);
  let row = 10;
  for (const block of blocks) row = writeBlock(ws, row, block);
  writeFooter(ws, row - 1);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
