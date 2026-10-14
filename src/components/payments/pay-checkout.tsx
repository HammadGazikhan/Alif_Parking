"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CheckoutView } from "@/server/services/payment.service";

export type CheckoutFee = {
  id: string;
  period: string;
  vehicleNumber: string;
  amount: number;
  baseAmount: number;
  lateFee: number;
  status: string;
  dueDate: string;
};

const POLL_MS = 3000;

const UPI_APPS = [
  { name: "Google Pay", scheme: "tez://upi/pay", tone: "bg-white text-ink" },
  { name: "PhonePe", scheme: "phonepe://pay", tone: "bg-[#5f259f] text-white" },
  { name: "Paytm", scheme: "paytmmp://pay", tone: "bg-[#00baf2] text-white" },
  { name: "BHIM", scheme: "upi://pay", tone: "bg-[#f47a20] text-white" },
];

function useCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

export function PayCheckout({ fee, simulate }: { fee: CheckoutFee; simulate: boolean }) {
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const started = useRef(false);
  const forceReconcile = useRef(false);

  const createOrder = useMutation({
    mutationFn: () => api<CheckoutView>("/api/payments/create-order", { method: "POST", body: { feeId: fee.id } }),
    onSuccess: (view) => setPaymentId(view.id),
  });

  const status = useQuery({
    queryKey: ["payment", paymentId],
    queryFn: () => {
      const reconcile = forceReconcile.current;
      forceReconcile.current = false;
      return api<CheckoutView>(`/api/payments/${paymentId}`, {
        cache: "no-store",
        query: reconcile ? { reconcile: "1" } : undefined,
      });
    },
    enabled: !!paymentId,
    initialData: createOrder.data?.id === paymentId ? createOrder.data : undefined,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "PENDING" || s === "CREATED" || !s ? POLL_MS : false;
    },
    refetchIntervalInBackground: true,
  });

  const start = useCallback(() => {
    setPaymentId(null);
    createOrder.mutate();
  }, [createOrder]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    createOrder.mutate();
  }, [createOrder]);

  const refreshNow = useCallback(() => {
    forceReconcile.current = true;
    void status.refetch();
  }, [status]);

  const view = status.data ?? createOrder.data;

  if (createOrder.isError && !view) {
    return (
      <StateCard
        tone="danger"
        icon={XCircle}
        title="Couldn't start the payment"
        description={errorMessage(createOrder.error)}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/employee/dashboard">
                <ArrowLeft /> Back
              </Link>
            </Button>
            <Button onClick={start}>
              <RefreshCw /> Try again
            </Button>
          </>
        }
      />
    );
  }

  if (!view) return <CheckoutSkeleton fee={fee} />;
  if (view.status === "SUCCESS") return <SuccessScreen view={view} />;
  if (view.status === "FAILED" || view.status === "REFUNDED") {
    return (
      <StateCard
        tone="danger"
        icon={XCircle}
        title="Payment not completed"
        description={view.failureReason ?? "The payment could not be completed. No money was taken for this attempt."}
        actions={
          <Button onClick={start} disabled={createOrder.isPending}>
            {createOrder.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Generate new QR
          </Button>
        }
      />
    );
  }

  return (
    <PendingCheckout
      fee={fee}
      view={view}
      checking={status.isFetching}
      onCheck={refreshNow}
      onRegenerate={start}
      regenerating={createOrder.isPending}
      simulate={simulate}
    />
  );
}

function PendingCheckout({
  fee,
  view,
  checking,
  onCheck,
  onRegenerate,
  regenerating,
  simulate,
}: {
  fee: CheckoutFee;
  view: CheckoutView;
  checking: boolean;
  onCheck: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
  simulate: boolean;
}) {
  const remaining = useCountdown(view.expiresAt);
  const expired = remaining === 0;
  const upiQuery = view.upiUri?.split("?")[1];

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 lg:grid-cols-2 lg:items-start">
      <div className="order-2 space-y-5 lg:order-1">
        <div className="ink-surface rounded-2xl px-5 py-5 text-white sm:px-6">
          <p className="eyebrow text-gold">Scan to pay</p>
          <p className="mt-2 text-4xl font-bold tracking-tight tabular">{formatINR(view.amount)}</p>
          <p className="mt-1 text-xs text-white/60">
            {view.fee.period} · <span className="font-mono">{view.fee.vehicleNumber}</span>
          </p>
        </div>

        <FeeSummary fee={fee} />

        <div className="space-y-4">
          {view.checkout ? <PayOnThisPhone view={view} disabled={expired} onPaid={onCheck} /> : null}
          {view.upiUri ? (
            <Button variant="ink" className="w-full lg:hidden" asChild>
              <a href={view.upiUri}>
                <Smartphone /> Open UPI app
              </a>
            </Button>
          ) : null}
          {upiQuery ? (
            <div className="lg:hidden">
              <div className="grid grid-cols-4 gap-2">
                {UPI_APPS.map((app) => (
                  <a
                    key={app.name}
                    href={`${app.scheme}?${upiQuery}`}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-2 text-center transition active:scale-95"
                  >
                    <span className={cn("flex size-9 items-center justify-center rounded-full text-[11px] font-bold shadow-soft", app.tone)}>
                      {app.name.slice(0, 1)}
                    </span>
                    <span className="text-[10px] leading-tight font-medium">{app.name}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-2 font-medium text-foreground" role="status" aria-live="polite">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full rounded-full bg-gold opacity-75 animate-pulse-ring" />
                <span className="relative inline-flex size-2.5 rounded-full bg-gold" />
              </span>
              Waiting for payment…
            </span>
            {remaining !== null && !expired ? (
              <span className="flex items-center gap-1 text-muted-foreground tabular">
                <Clock className="size-3.5" />
                {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
              </span>
            ) : null}
          </div>
          <Button variant="outline" className="w-full" onClick={onCheck} disabled={checking}>
            {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} I&apos;ve paid — check status
          </Button>
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" />
            Your payment is confirmed directly by the payment gateway. This page updates automatically — please don&apos;t pay twice.
          </p>
          {simulate ? <SimulatePanel paymentId={view.id} onDone={onCheck} /> : null}
        </div>
      </div>

      <section className="surface-card order-1 overflow-hidden lg:order-2 animate-fade-up">
        <div className="relative bg-white">
            {view.qrImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={view.qrImageUrl}
                alt={`UPI QR code for ${formatINR(view.amount)}`}
                className={cn("block h-auto w-full", expired && "opacity-15 blur-[2px]")}
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">QR unavailable</div>
            )}
            {!expired ? (
              <div className="pointer-events-none absolute inset-x-[22%] top-[31%] h-[34%] overflow-hidden" aria-hidden>
                <span
                  className="absolute inset-x-0 top-0 block h-full animate-scan"
                  style={{ ["--scan-distance" as string]: "calc(100% - 2px)" }}
                >
                  <span className="absolute inset-x-0 top-0 h-0.5 rounded-full bg-gold/90 shadow-[0_0_12px_var(--gold)]" />
                </span>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/80 p-6 text-center">
                <p className="text-sm font-semibold">This QR has expired</p>
                <Button size="sm" onClick={onRegenerate} disabled={regenerating}>
                  {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />} New QR
                </Button>
              </div>
            )}
        </div>
      </section>
    </div>
  );
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

function PayOnThisPhone({ view, disabled, onPaid }: { view: CheckoutView; disabled: boolean; onPaid: () => void }) {
  const [opening, setOpening] = useState(false);
  const checkout = view.checkout;
  if (!checkout) return null;

  async function pay() {
    setOpening(true);
    try {
      await loadCheckout();
      if (!window.Razorpay) throw new Error("Razorpay Checkout could not be loaded.");
      new window.Razorpay({
        key: checkout.keyId,
        amount: view.amount,
        currency: view.currency,
        name: "Alif Parking Fees",
        description: `${view.fee.period} · ${view.fee.vehicleNumber}`,
        order_id: checkout.orderId,
        handler: () => onPaid(),
        theme: { color: "#111111" },
      }).open();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setOpening(false);
    }
  }

  return (
    <Button variant="ink" className="w-full lg:hidden" onClick={pay} disabled={disabled || opening}>
      {opening ? <Loader2 className="animate-spin" /> : <Smartphone />} Pay on this phone
    </Button>
  );
}

function SimulatePanel({ paymentId, onDone }: { paymentId: string; onDone: () => void }) {
  const simulate = useMutation({
    mutationFn: (outcome: "success" | "failed") =>
      api<{ status: number; webhook: Record<string, unknown> }>("/api/payments/mock/simulate", {
        method: "POST",
        body: { paymentId, outcome },
      }),
    onSuccess: () => onDone(),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-info/40 bg-info-soft/60 p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-info">
        <FlaskConical className="size-3.5" /> Development mode — mock gateway
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Sends a signed gateway webhook through the real verification path.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={() => simulate.mutate("success")} disabled={simulate.isPending}>
          {simulate.isPending && simulate.variables === "success" ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="text-success" />}
          Simulate success
        </Button>
        <Button size="sm" variant="outline" onClick={() => simulate.mutate("failed")} disabled={simulate.isPending}>
          {simulate.isPending && simulate.variables === "failed" ? <Loader2 className="animate-spin" /> : <XCircle className="text-danger" />}
          Simulate failure
        </Button>
      </div>
    </div>
  );
}

function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia("(min-width: 1024px)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
}

function FeeSummary({ fee, className }: { fee: CheckoutFee; className?: string }) {
  const isDesktop = useIsDesktop();
  const steps = [
    "Scan the QR on this page with another phone",
    ...(isDesktop ? [] : ["Or tap Pay on this phone for UPI, card, or netbanking"]),
    "Approve the payment",
  ];
  const rows = [
    { label: "Billing period", value: fee.period },
    { label: "Vehicle", value: <span className="font-mono font-semibold">{fee.vehicleNumber}</span> },
    { label: "Monthly fee", value: formatINR(fee.baseAmount) },
    ...(fee.lateFee ? [{ label: "Late fee", value: <span className="text-danger">{formatINR(fee.lateFee)}</span> }] : []),
  ];
  return (
    <section className={cn("surface-card p-5 sm:p-6 animate-fade-up", className)}>
      <h2 className="text-sm font-semibold">Payment summary</h2>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="tabular">{r.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 border-t border-dashed border-border pt-3">
          <dt className="font-semibold">Total payable</dt>
          <dd className="text-lg font-bold tabular">{formatINR(fee.amount)}</dd>
        </div>
      </dl>
      <ol className="mt-6 space-y-3 text-sm">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gold-soft text-[11px] font-bold text-gold-strong">
              {index + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SuccessScreen({ view }: { view: CheckoutView }) {
  return (
    <section className="surface-card mx-auto max-w-md overflow-hidden text-center animate-fade-up">
      <div className="ink-surface relative px-6 pt-10 pb-8 text-white">
        <div className="relative mx-auto flex size-20 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-gold/30 animate-pulse-ring" aria-hidden />
          <span className="relative flex size-20 items-center justify-center rounded-full bg-gold text-ink shadow-gold">
            <CheckCircle2 className="size-10" strokeWidth={2.2} />
          </span>
        </div>
        <h2 className="mt-6 text-2xl font-bold tracking-tight">Payment successful</h2>
        <p className="mt-1 text-sm text-white/60">Thank you! Your parking is paid for {view.fee.period}.</p>
        <p className="mt-5 text-4xl font-bold tracking-tight text-gold tabular">{formatINR(view.amount)}</p>
      </div>
      <dl className="space-y-3 px-6 py-5 text-left text-sm">
        <Row label="Transaction ID" value={<span className="font-mono text-xs break-all">{view.transactionId ?? "—"}</span>} />
        <Row label="Paid on" value={formatDateTime(view.paidAt)} />
        <Row label="Vehicle" value={<span className="font-mono">{view.fee.vehicleNumber}</span>} />
        <Row label="Method" value={(view.paymentMethod ?? "UPI").toUpperCase()} />
      </dl>
      <div className="grid gap-2 border-t border-border px-6 py-5 sm:grid-cols-2">
        <Button variant="outline" asChild>
          <Link href="/employee/dashboard">Back to dashboard</Link>
        </Button>
        <Button asChild>
          <Link href={`/employee/payments/${view.id}/receipt`}>
            <ReceiptText /> View receipt
          </Link>
        </Button>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function StateCard({
  tone,
  icon: Icon,
  title,
  description,
  actions,
}: {
  tone: "danger";
  icon: typeof XCircle;
  title: string;
  description: string;
  actions: React.ReactNode;
}) {
  return (
    <section className="surface-card mx-auto max-w-md px-6 py-10 text-center animate-fade-up">
      <span
        className={cn(
          "mx-auto flex size-14 items-center justify-center rounded-2xl",
          tone === "danger" && "bg-danger-soft text-danger",
        )}
      >
        <Icon className="size-7" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>
    </section>
  );
}

function CheckoutSkeleton({ fee }: { fee: CheckoutFee }) {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 lg:grid-cols-2 lg:items-start">
      <FeeSummary fee={fee} className="order-2 lg:order-1" />
      <section className="surface-card order-1 overflow-hidden lg:order-2">
        <div className="ink-surface px-6 pt-5 pb-6 text-center text-white">
          <p className="eyebrow text-gold">Preparing secure QR</p>
          <p className="mt-2 text-4xl font-bold tabular">{formatINR(fee.amount)}</p>
        </div>
        <div className="flex flex-col items-center gap-3 p-6">
          <div className="flex aspect-square w-full max-w-[280px] items-center justify-center rounded-3xl border border-border bg-muted/50">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">Creating your payment request…</p>
        </div>
      </section>
    </div>
  );
}
