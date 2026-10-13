import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseJson, parseQuery, route } from "@/server/http";
import { createEmployee, listEmployees } from "@/server/services/employee.service";
import { employeeCreateSchema, employeeListQuerySchema } from "@/lib/validations/employee";

export const GET = route(async (req) => {
  await requireApiAdmin();
  return ok(await listEmployees(parseQuery(req, employeeListQuerySchema)));
});

export const POST = route(async (req) => {
  const admin = await requireApiAdmin();
  const input = await parseJson(req, employeeCreateSchema);
  return ok(await createEmployee(admin, input), { status: 201 });
});
