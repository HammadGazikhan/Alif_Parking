import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseJson, route } from "@/server/http";
import { getSettings, updateSettings } from "@/server/services/settings.service";
import { parkingSettingsSchema } from "@/lib/validations/parking";

export const GET = route(async () => {
  await requireApiAdmin();
  return ok(await getSettings());
});

export const PUT = route(async (req) => {
  const admin = await requireApiAdmin();
  const input = await parseJson(req, parkingSettingsSchema);
  return ok(await updateSettings(admin, input));
});
