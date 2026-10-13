import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseQuery, route } from "@/server/http";
import { searchUnregisteredDirectoryPeople } from "@/server/services/employee.service";
import { directorySearchQuerySchema } from "@/lib/validations/employee";

export const GET = route(async (req) => {
  await requireApiAdmin();
  const { search } = parseQuery(req, directorySearchQuerySchema);
  return ok(await searchUnregisteredDirectoryPeople(search));
});
