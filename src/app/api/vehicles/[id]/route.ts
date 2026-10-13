import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseJson, route } from "@/server/http";
import { deleteVehicle, getVehicle, updateVehicle } from "@/server/services/vehicle.service";
import { vehicleUpdateSchema } from "@/lib/validations/vehicle";

type Ctx = RouteContext<"/api/vehicles/[id]">;

export const GET = route<Ctx>(async (_req, { params }) => {
  await requireApiAdmin();
  const { id } = await params;
  return ok(await getVehicle(id));
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const admin = await requireApiAdmin();
  const { id } = await params;
  const input = await parseJson(req, vehicleUpdateSchema);
  return ok(await updateVehicle(admin, id, input));
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const admin = await requireApiAdmin();
  const { id } = await params;
  await deleteVehicle(admin, id);
  return ok({ deleted: true });
});
