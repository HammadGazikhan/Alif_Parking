import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseJson, parseQuery, route } from "@/server/http";
import { createVehicle, listVehicles } from "@/server/services/vehicle.service";
import { vehicleFormSchema, vehicleListQuerySchema } from "@/lib/validations/vehicle";

export const GET = route(async (req) => {
  await requireApiAdmin();
  return ok(await listVehicles(parseQuery(req, vehicleListQuerySchema)));
});

export const POST = route(async (req) => {
  const admin = await requireApiAdmin();
  const input = await parseJson(req, vehicleFormSchema);
  return ok(await createVehicle(admin, input), { status: 201 });
});
