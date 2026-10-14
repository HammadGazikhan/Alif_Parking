import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseQuery, route } from "@/server/http";
import { getMonthlyCollection, getReportRows, listFeePeriods } from "@/server/services/report.service";
import { reportQuerySchema } from "@/lib/validations/payment";

export const GET = route(async (req) => {
  await requireApiAdmin();
  const query = parseQuery(req, reportQuerySchema);
  const [monthly, rows, periods] = await Promise.all([
    getMonthlyCollection(query),
    getReportRows(query, 200),
    listFeePeriods(),
  ]);
  const totals = monthly.reduce(
    (acc, m) => ({
      expected: acc.expected + m.expected,
      collected: acc.collected + m.collected,
      outstanding: acc.outstanding + m.outstanding,
    }),
    { expected: 0, collected: 0, outstanding: 0 },
  );
  return ok({ monthly, totals, rows, periods });
});
