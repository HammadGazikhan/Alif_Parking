import { requireApiAdmin } from "@/server/auth/guards";
import { ok, route } from "@/server/http";
import { createRazorpayTestOrder } from "@/server/payments/razorpay-test";

export const runtime = "nodejs";

export const POST = route(async () => {
  await requireApiAdmin();
  return ok(await createRazorpayTestOrder(), { status: 201 });
});
