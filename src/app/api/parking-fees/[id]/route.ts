import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseJson, route } from "@/server/http";
import { updateParkingFee } from "@/server/services/parking-fee.service";
import { parkingFeeUpdateSchema } from "@/lib/validations/parking";

type Ctx = RouteContext<"/api/parking-fees/[id]">;

export const PATCH = route<Ctx>(async (req, { params }) => {
  const admin = await requireApiAdmin();
  const { id } = await params;
  const input = await parseJson(req, parkingFeeUpdateSchema);
  return ok(await updateParkingFee(admin, id, input));
});
