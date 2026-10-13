import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseQuery, route } from "@/server/http";
import { listParkingFees } from "@/server/services/parking-fee.service";
import { parkingFeeListQuerySchema } from "@/lib/validations/parking";

export const GET = route(async (req) => {
  await requireApiAdmin();
  return ok(await listParkingFees(parseQuery(req, parkingFeeListQuerySchema)));
});
