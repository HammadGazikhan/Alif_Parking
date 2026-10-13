import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseJson, parseQuery, route } from "@/server/http";
import { generateMonthlyFees, previewFeeGeneration } from "@/server/services/fee-generation.service";
import { feeGenerationSchema } from "@/lib/validations/parking";

/** Preview: eligible employees/vehicles and expected collection for a period. */
export const GET = route(async (req) => {
  await requireApiAdmin();
  const { month, year } = parseQuery(req, feeGenerationSchema);
  return ok(await previewFeeGeneration(month, year));
});

export const POST = route(async (req) => {
  const admin = await requireApiAdmin();
  const { month, year } = await parseJson(req, feeGenerationSchema);
  return ok(await generateMonthlyFees(admin, month, year), { status: 201 });
});
