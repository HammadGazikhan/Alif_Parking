"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, Loader2, ShieldCheck, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/page-header";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { formatINR } from "@/lib/money";

type RazorpayTestOrder = { orderId: string; amount: number; currency: string; keyId: string };
type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded."));
    document.body.appendChild(script);
  });
}

export function RazorpayTestConsole() {
  const [creating, setCreating] = useState(false);
  const [verifiedPaymentId, setVerifiedPaymentId] = useState<string | null>(null);

  async function startTestPayment() {
    setCreating(true);
    setVerifiedPaymentId(null);
    try {
      const order = await api<RazorpayTestOrder>("/api/admin/razorpay-test", { method: "POST" });
      await loadCheckout();
      if (!window.Razorpay) throw new Error("Razorpay Checkout could not be loaded.");

      new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Alif Parking Portal",
        description: "Test payment",
        order_id: order.orderId,
        handler: async (response: RazorpayResponse) => {
          try {
            const verified = await api<{ verified: true; paymentId: string }>("/api/admin/razorpay-test/verify", {
              method: "POST",
              body: { orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature },
            });
            setVerifiedPaymentId(verified.paymentId);
            toast.success("Razorpay test payment verified.");
          } catch (error) {
            toast.error(errorMessage(error));
          }
        },
        theme: { color: "#1d4ed8" },
      }).open();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Test mode check"
        description="Opens Razorpay Standard Checkout with a ₹1 test order. No portal fee is created."
        actions={
          <Button onClick={startTestPayment} disabled={creating}>
            {creating ? <Loader2 className="animate-spin" /> : <CreditCard />}
            Start test payment
          </Button>
        }
        contentClassName="p-5 sm:p-6"
      >
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-success-soft text-success"><ShieldCheck className="size-4" /></span>
            <div><p className="font-medium">Admin protected</p><p className="text-xs text-muted-foreground">Only portal administrators</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info"><TestTube2 className="size-4" /></span>
            <div><p className="font-medium">{formatINR(100)} test order</p><p className="text-xs text-muted-foreground">Razorpay test mode only</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-warning-soft text-warning"><CheckCircle2 className="size-4" /></span>
            <div><p className="font-medium">Signed response</p><p className="text-xs text-muted-foreground">Verified on this server</p></div>
          </div>
        </div>
      </SectionCard>

      {verifiedPaymentId ? (
        <SectionCard title="Payment verified" description={`Razorpay payment ID: ${verifiedPaymentId}`} contentClassName="p-5 sm:p-6">
          <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" /> The test payment signature is valid.</p>
        </SectionCard>
      ) : null}
    </div>
  );
}
