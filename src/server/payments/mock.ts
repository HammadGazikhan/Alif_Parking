import "server-only";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { env } from "@/server/env";
import { hmacSha256Hex, verifyHmacSignature } from "./signature";
import { parseRazorpayStyleEvent } from "./razorpay";
import type { PaymentGateway } from "./types";

const id = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;

export function buildUpiUri(params: { amount: number; reference: string; note: string }) {
  const { UPI_VPA, UPI_PAYEE_NAME } = env();
  const qs = new URLSearchParams({
    pa: UPI_VPA,
    pn: UPI_PAYEE_NAME,
    am: (params.amount / 100).toFixed(2),
    cu: "INR",
    tn: params.note.slice(0, 50),
    tr: params.reference,
  });
  return `upi://pay?${qs.toString()}`;
}

/**
 * Local development gateway. Produces a real UPI QR code and emits
 * Razorpay-format webhook events signed with MOCK_WEBHOOK_SECRET, so the
 * exact same verification and settlement path runs as in production.
 */
export const mockGateway: PaymentGateway = {
  id: "MOCK",

  async createCollectRequest(input) {
    const orderId = id("mock_qr");
    const upiUri = buildUpiUri({ amount: input.amount, reference: orderId, note: input.description });
    const qrImageUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
      color: { dark: "#05070d", light: "#ffffff" },
    });
    return { orderId, qrCodeId: orderId, qrImageUrl, upiUri, raw: { orderId, upiUri } };
  },

  async closeCollectRequest() {},

  verifyWebhookSignature(rawBody, headers) {
    return verifyHmacSignature(env().MOCK_WEBHOOK_SECRET, rawBody, headers.get("x-mock-signature"));
  },

  parseWebhookEvent(rawBody, headers) {
    return parseRazorpayStyleEvent(rawBody, headers.get("x-mock-event-id"));
  },

  async fetchSuccessfulPayment() {
    return null;
  },
};

/** Build a signed, Razorpay-shaped event as the mock gateway would send it. */
export function buildMockWebhook(params: {
  qrCodeId?: string;
  amount: number;
  outcome: "success" | "failed";
  paymentRef: string;
  feeId?: string;
  event?: "qr_code.credited" | "payment.captured" | "payment.failed";
}) {
  const gatewayPaymentId = id("pay_MOCK");
  const now = Math.floor(Date.now() / 1000);
  const notes = {
    payment_ref: params.paymentRef,
    ...(params.feeId ? { fee_id: params.feeId } : {}),
  };
  const body = JSON.stringify({
    entity: "event",
    event: params.event ?? (params.outcome === "success" ? "qr_code.credited" : "payment.failed"),
    created_at: now,
    payload: {
      payment: {
        entity: {
          id: gatewayPaymentId,
          entity: "payment",
          amount: params.amount,
          currency: "INR",
          status: params.outcome === "success" ? "captured" : "failed",
          method: "upi",
          vpa: "employee@okaxis",
          created_at: now,
          error_description: params.outcome === "failed" ? "Payment declined by payer" : null,
          notes,
        },
      },
      ...(params.qrCodeId
        ? { qr_code: { entity: { id: params.qrCodeId, entity: "qr_code", notes } } }
        : {}),
    },
  });
  const headers = new Headers({
    "content-type": "application/json",
    "x-mock-event-id": id("evt_MOCK"),
    "x-mock-signature": hmacSha256Hex(env().MOCK_WEBHOOK_SECRET, body),
  });
  return { body, headers, gatewayPaymentId };
}
