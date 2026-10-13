import { NextResponse } from "next/server";
import { processWebhook } from "@/server/services/webhook.service";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Payment gateway webhook. Authenticated solely by the HMAC signature over
 * the raw body (no session); excluded from the auth proxy.
 */
export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const result = await processWebhook(rawBody, req.headers);
  return NextResponse.json(result.body, { status: result.status });
}
