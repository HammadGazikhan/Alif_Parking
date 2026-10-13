import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";

const TEST_ORDER_AMOUNT = 100;

export function isRazorpayTestKey(keyId: string): boolean {
  return keyId.startsWith("rzp_test_");
}

export function razorpayTestRequestError(error: unknown): AppError {
  console.error("[razorpay-test] failed to create test order", error);
  return new AppError(
    502,
    "RAZORPAY_TEST_REQUEST_FAILED",
    "Razorpay could not create a test order. Check that the test key and secret are valid.",
  );
}

function basicAuth(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/** Creates a deliberately small Razorpay Standard Checkout order for test mode. */
export async function createRazorpayTestOrder() {
  const settings = env();
  if (settings.PAYMENT_PROVIDER !== "razorpay") {
    throw new AppError(409, "RAZORPAY_NOT_ACTIVE", "Set PAYMENT_PROVIDER=razorpay before creating a test QR.");
  }
  if (!isRazorpayTestKey(settings.RAZORPAY_KEY_ID)) {
    throw new AppError(403, "LIVE_KEY_BLOCKED", "This test tool only accepts Razorpay test keys.");
  }

  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: basicAuth(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: TEST_ORDER_AMOUNT,
        currency: "INR",
        receipt: `parking-${randomUUID().replaceAll("-", "")}`,
        notes: { source: "admin_razorpay_test" },
      }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
    if (!res.ok || !body.id) {
      throw new Error(`Razorpay order request failed (${res.status}): ${body.error?.description ?? "unknown error"}`);
    }
    return { orderId: body.id, amount: TEST_ORDER_AMOUNT, currency: "INR", keyId: settings.RAZORPAY_KEY_ID };
  } catch (error) {
    throw razorpayTestRequestError(error);
  }
}

export function verifyRazorpayTestPayment(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac("sha256", env().RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
  const received = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}
