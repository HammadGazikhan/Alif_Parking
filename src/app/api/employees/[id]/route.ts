import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseJson, route } from "@/server/http";
import { getEmployee, updateEmployee } from "@/server/services/employee.service";
import { employeeUpdateSchema } from "@/lib/validations/employee";

type Ctx = RouteContext<"/api/employees/[id]">;

export const GET = route<Ctx>(async (_req, { params }) => {
  await requireApiAdmin();
  const { id } = await params;
  return ok(await getEmployee(id));
});

/** Partial update; `{ status }` alone activates/deactivates (audited accordingly). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const admin = await requireApiAdmin();
  const { id } = await params;
  const input = await parseJson(req, employeeUpdateSchema);
  return ok(await updateEmployee(admin, id, input));
});
