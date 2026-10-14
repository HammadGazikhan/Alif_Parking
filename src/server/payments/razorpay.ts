import "server-only";
import { env } from "@/server/env";
import { sha256Hex, verifyHmacSignature } from "./signature";
import type { GatewaySuccess, ParsedWebhookEvent, PaymentGateway } from "./types";

const API_BASE = "https://api.razorpay.com/v1";

type RazorpayPaymentEntity = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  vpa?: string | null;
  order_id?: string | null;
  created_at?: number;
  error_description?: string | null;
  notes?: Record<string, string> | unknown[];
};

type RazorpayEvent = {
  event: string;
  created_at?: number;
  payload?: {
    payment?: { entity: RazorpayPaymentEntity };
    qr_code?: { entity: { id: string; notes?: Record<string, string> | unknown[] } };
    order?: { entity: { id: string; notes?: Record<string, string> | unknown[] } };
  };
};

function authHeader() {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env();
  return `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`;
}

async function razorpayFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) {
    throw new Error(`Razorpay API ${path} failed (${res.status}): ${body.error?.description ?? "unknown error"}`);
  }
  return body;
}

function notesOf(value: unknown): Record<string, string> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
}

function toSuccess(p: RazorpayPaymentEntity): GatewaySuccess {
  return {
    gatewayPaymentId: p.id,
    amount: p.amount,
    currency: p.currency,
    method: p.method ?? null,
    vpa: p.vpa ?? null,
    paidAt: p.created_at ? new Date(p.created_at * 1000) : new Date(),
  };
}

/**
 * Translate a Razorpay-format webhook body into our normalized event.
 * Shared with the mock gateway, which emits the same payload shape.
 */
export function parseRazorpayStyleEvent(rawBody: string, eventId: string | null): ParsedWebhookEvent {
  const event = JSON.parse(rawBody) as RazorpayEvent;
  const payment = event.payload?.payment?.entity;
  const qr = event.payload?.qr_code?.entity;
  const order = event.payload?.order?.entity;
  const notes = { ...notesOf(order?.notes), ...notesOf(qr?.notes), ...notesOf(payment?.notes) };

  const reference = {
    qrCodeId: qr?.id,
    orderId: order?.id ?? payment?.order_id ?? qr?.id ?? undefined,
    paymentRef: notes.payment_ref,
    feeId: notes.fee_id,
  };
  const base = {
    eventId: eventId || sha256Hex(rawBody),
    type: event.event,
    reference,
    gatewayPaymentId: payment?.id,
  };

  switch (event.event) {
    case "qr_code.credited":
    case "payment.captured":
    case "order.paid":
      if (payment && payment.status === "captured") {
        return { ...base, outcome: "success", success: toSuccess(payment) };
      }
      return { ...base, outcome: "ignored" };
    case "payment.failed":
      return { ...base, outcome: "failed", failureReason: payment?.error_description ?? "Payment failed" };
    default:
      return { ...base, outcome: "ignored" };
  }
}

export const razorpayGateway: PaymentGateway = {
  id: "RAZORPAY",

  async createCollectRequest(input) {
    const notes = { ...input.notes, payment_ref: input.reference };
    const qr = await razorpayFetch<{ id: string; image_url: string }>("/payments/qr_codes", {
      method: "POST",
      body: JSON.stringify({
        type: "upi_qr",
        name: env().UPI_PAYEE_NAME.slice(0, 40),
        usage: "single_use",
        fixed_amount: true,
        payment_amount: input.amount,
        description: input.description.slice(0, 255),
        close_by: Math.floor(input.expiresAt.getTime() / 1000),
        notes,
      }),
    });
    try {
      const order = await razorpayFetch<{ id: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          amount: input.amount,
          currency: input.currency,
          receipt: input.reference.slice(0, 40),
          notes,
        }),
      });
      return { orderId: order.id, qrCodeId: qr.id, qrImageUrl: qr.image_url, upiUri: null, raw: { qr, order } };
    } catch (error) {
      try {
        await razorpayFetch(`/payments/qr_codes/${encodeURIComponent(qr.id)}/close`, { method: "POST" });
      } catch (closeError) {
        console.warn("[razorpay] failed to close QR after order error", closeError);
      }
      throw error;
    }
  },

  async closeCollectRequest({ qrCodeId }) {
    if (!qrCodeId) return;
    try {
      await razorpayFetch(`/payments/qr_codes/${encodeURIComponent(qrCodeId)}/close`, { method: "POST" });
    } catch (error) {
      console.warn("[razorpay] failed to close QR code", qrCodeId, error);
    }
  },

  verifyWebhookSignature(rawBody, headers) {
    return verifyHmacSignature(env().RAZORPAY_WEBHOOK_SECRET, rawBody, headers.get("x-razorpay-signature"));
  },

  parseWebhookEvent(rawBody, headers) {
    return parseRazorpayStyleEvent(rawBody, headers.get("x-razorpay-event-id"));
  },

  async fetchSuccessfulPayment({ orderId, qrCodeId }) {
    const captured = (items: RazorpayPaymentEntity[] | undefined) => items?.find((p) => p.status === "captured");
    if (qrCodeId) {
      try {
        const qrPayments = await razorpayFetch<{ items: RazorpayPaymentEntity[] }>(
          `/payments/qr_codes/${encodeURIComponent(qrCodeId)}/payments`,
        );
        const paid = captured(qrPayments.items);
        if (paid) return toSuccess(paid);
      } catch (error) {
        console.warn("[razorpay] QR payment lookup failed", error);
      }
    }
    if (orderId?.startsWith("order_")) {
      const orderPayments = await razorpayFetch<{ items: RazorpayPaymentEntity[] }>(
        `/orders/${encodeURIComponent(orderId)}/payments`,
      );
      const paid = captured(orderPayments.items);
      if (paid) return toSuccess(paid);
    }
    return null;
  },
};
