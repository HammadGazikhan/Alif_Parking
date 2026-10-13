import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/** Constant-time comparison of an expected HMAC against a received signature. */
export function verifyHmacSignature(secret: string, rawBody: string, signature: string | null): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(hmacSha256Hex(secret, rawBody), "utf8");
  const received = Buffer.from(signature.trim(), "utf8");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
