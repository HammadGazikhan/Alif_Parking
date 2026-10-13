import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseJson, route } from "@/server/http";
import { createCategory, listCategories } from "@/server/services/category.service";
import { categorySchema } from "@/lib/validations/parking";

export const GET = route(async () => {
  await requireApiAdmin();
  return ok(await listCategories());
});

export const POST = route(async (req) => {
  const admin = await requireApiAdmin();
  const input = await parseJson(req, categorySchema);
  return ok(await createCategory(admin, input), { status: 201 });
});
