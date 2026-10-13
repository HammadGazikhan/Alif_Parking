import { requireApiAdmin } from "@/server/auth/guards";
import { ok, route } from "@/server/http";
import { sendFeeReminder } from "@/server/services/parking-fee.service";

type Ctx = RouteContext<"/api/parking-fees/[id]/remind">;

export const POST = route<Ctx>(async (_req, { params }) => {
  const admin = await requireApiAdmin();
  const { id } = await params;
  await sendFeeReminder(admin, id);
  return ok({ sent: true });
});
