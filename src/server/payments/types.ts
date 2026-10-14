import type { PaymentProvider as ProviderId } from "@/generated/prisma/client";

export type CollectRequestInput = {
  /** Our internal payment reference (Payment.id). */
  reference: string;
  /** Amount in paise. Always computed server-side from the parking fee. */
  amount: number;
  currency: string;
  description: string;
  customerName: string;
  expiresAt: Date;
  notes: Record<string, string>;
};

export type CollectRequest = {
  orderId: string;
  qrCodeId: string | null;
  qrImageUrl: string | null;
  upiUri: string | null;
  raw: unknown;
};

export type GatewaySuccess = {
  gatewayPaymentId: string;
  amount: number;
  currency: string;
  method: string | null;
  vpa: string | null;
  paidAt: Date;
};

export type ParsedWebhookEvent = {
  eventId: string;
  type: string;
  outcome: "success" | "failed" | "ignored";
  reference: { orderId?: string; qrCodeId?: string; paymentRef?: string; feeId?: string };
  success?: GatewaySuccess;
  failureReason?: string;
  gatewayPaymentId?: string;
};

export interface PaymentGateway {
  readonly id: ProviderId;
  createCollectRequest(input: CollectRequestInput): Promise<CollectRequest>;
  closeCollectRequest(ref: { orderId: string; qrCodeId: string | null }): Promise<void>;
  /** Verify the webhook signature over the exact raw request body. */
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean;
  parseWebhookEvent(rawBody: string, headers: Headers): ParsedWebhookEvent;
  /** Server-to-server reconciliation, used when a webhook may be delayed. */
  fetchSuccessfulPayment(ref: { orderId: string; qrCodeId: string | null }): Promise<GatewaySuccess | null>;
}
