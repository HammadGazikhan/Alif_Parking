import { z } from "zod";
import { requireApiUser } from "@/server/auth/guards";
import { ok, parseJson, route } from "@/server/http";
import { listNotifications, markNotificationsRead } from "@/server/services/notification.service";

export const GET = route(async () => {
  const user = await requireApiUser();
  return ok(await listNotifications(user.id));
});

const markSchema = z.object({ ids: z.array(z.string().min(1)).max(100).optional() });

export const PATCH = route(async (req) => {
  const user = await requireApiUser();
  const { ids } = await parseJson(req, markSchema);
  return ok({ updated: await markNotificationsRead(user.id, ids) });
});
