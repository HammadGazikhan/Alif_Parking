import "server-only";
import ExcelJS from "exceljs";
import type { ReportQuery } from "@/lib/validations/payment";
import { getMonthlyCollection, getReportRows } from "@/server/services/report.service";
import { formatBillingPeriod, formatDate } from "@/lib/dates";
import { paiseToRupees } from "@/lib/money";
import { toCsv } from "@/lib/csv";

const DETAIL_HEADERS = [
  "Employee",
  "Email",
  "Vehicle",
  "Category",
  "Billing Month",
  "Base Amount (INR)",
  "Late Fee (INR)",
  "Amount (INR)",
  "Status",
  "Due Date",
  "Paid At",
  "Transaction ID",
];

async function detailRows(query: ReportQuery) {
  const fees = await getReportRows(query);
  return fees.map((f) => [
    f.user.name,
    f.user.email,
    f.vehicle.number,
    f.vehicle.category.name,
    formatBillingPeriod(f.month, f.year),
    paiseToRupees(f.baseAmount),
    paiseToRupees(f.lateFee),
    paiseToRupees(f.amount),
    f.status,
    formatDate(f.dueDate, ""),
    formatDate(f.paidAt, ""),
    f.payments[0]?.paymentId ?? "",
  ]);
}

export async function exportCsv(query: ReportQuery): Promise<string> {
  return toCsv([DETAIL_HEADERS, ...(await detailRows(query))]);
}

export async function exportXlsx(query: ReportQuery): Promise<Buffer> {
  const [rows, summary] = await Promise.all([detailRows(query), getMonthlyCollection(query)]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Alif Parking Portal";
  wb.created = new Date();

  const headerStyle = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF05070D" } };
    row.alignment = { vertical: "middle" };
    row.height = 22;
  };

  const s = wb.addWorksheet("Monthly Collection");
  s.columns = [
    { header: "Month", key: "label", width: 18 },
    { header: "Expected (INR)", key: "expected", width: 16 },
    { header: "Collected (INR)", key: "collected", width: 16 },
    { header: "Outstanding (INR)", key: "outstanding", width: 18 },
    { header: "Fees", key: "feeCount", width: 10 },
    { header: "Paid", key: "paidCount", width: 10 },
  ];
  headerStyle(s.getRow(1));
  for (const r of summary) {
    s.addRow({
      label: r.label,
      expected: paiseToRupees(r.expected),
      collected: paiseToRupees(r.collected),
      outstanding: paiseToRupees(r.outstanding),
      feeCount: r.feeCount,
      paidCount: r.paidCount,
    });
  }
  ["B", "C", "D"].forEach((c) => (s.getColumn(c).numFmt = "₹#,##0"));

  const d = wb.addWorksheet("Fee Details");
  d.addRow(DETAIL_HEADERS);
  headerStyle(d.getRow(1));
  rows.forEach((r) => d.addRow(r));
  d.columns.forEach((col, i) => {
    col.width = [22, 30, 14, 12, 16, 16, 14, 14, 12, 14, 14, 26][i] ?? 14;
  });
  ["F", "G", "H"].forEach((c) => (d.getColumn(c).numFmt = "₹#,##0"));
  d.views = [{ state: "frozen", ySplit: 1 }];

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
