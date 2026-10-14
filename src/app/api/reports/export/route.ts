import { requireApiAdmin } from "@/server/auth/guards";
import { parseQuery, route } from "@/server/http";
import { exportCsv, exportXlsx } from "@/server/services/export.service";
import { assertReportHasFees } from "@/server/services/report.service";
import { exportQuerySchema } from "@/lib/validations/payment";

export const GET = route(async (req) => {
  await requireApiAdmin();
  const { format, ...query } = parseQuery(req, exportQuerySchema);
  await assertReportHasFees(query);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const buffer = await exportXlsx(query);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="alif-parking-report-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = await exportCsv(query);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alif-parking-report-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
