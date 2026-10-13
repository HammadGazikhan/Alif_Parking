import "server-only";
import type { PaymentProvider } from "@/generated/prisma/client";
import { env, isMockPaymentsEnabled } from "@/server/env";
import { mockGateway } from "./mock";
import { razorpayGateway } from "./razorpay";
import type { PaymentGateway } from "./types";

/** The gateway used for new payments, chosen by PAYMENT_PROVIDER. */
export function activeGateway(): PaymentGateway {
  return env().PAYMENT_PROVIDER === "razorpay" ? razorpayGateway : mockGateway;
}

export function gatewayFor(provider: PaymentProvider): PaymentGateway {
  return provider === "RAZORPAY" ? razorpayGateway : mockGateway;
}

/**
 * Pick the gateway that claims an incoming webhook. The mock gateway is only
 * accepted when explicitly enabled outside production.
 */
export function gatewayForWebhook(headers: Headers): PaymentGateway | null {
  if (headers.has("x-razorpay-signature")) return razorpayGateway;
  if (headers.has("x-mock-signature") && isMockPaymentsEnabled()) return mockGateway;
  return null;
}

export type { PaymentGateway } from "./types";
