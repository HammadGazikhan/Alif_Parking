import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { markOverdueFees } from "@/server/services/parking-fee.service";

function authorized(req: Request) {
  const secret = env().CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !token) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Scheduled job: mark unpaid fees past their due date as OVERDUE. */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret." } }, { status: 401 });
  }
  const result = await markOverdueFees();
  return NextResponse.json({ data: result });
}
