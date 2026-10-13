import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseJson, route } from "@/server/http";
import { updateCategory } from "@/server/services/category.service";
import { categorySchema } from "@/lib/validations/parking";

type Ctx = RouteContext<"/api/settings/categories/[id]">;

export const PATCH = route(async (req, ctx: Ctx) => {
  const admin = await requireApiAdmin();
  const { id } = await ctx.params;
  const input = await parseJson(req, categorySchema);
  return ok(await updateCategory(admin, id, input));
});
