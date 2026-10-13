import { BadgeCheck } from "lucide-react";
import { AlifLogo } from "@/components/brand/alif-logo";
import { COMPANY_NAME } from "@/lib/constants";
import { formatBillingPeriod, formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export type ReceiptData = {
  id: string;
  paymentId: string | null;
  orderId: string;
  amount: number;
  paidAt: Date | null;
  paymentMethod: string | null;
  vpa: string | null;
  provider: string;
  parkingFee: {
    month: number;
    year: number;
    baseAmount: number;
    lateFee: number;
    user: { name: string; email: string };
    vehicle: { number: string; category: { name: string } };
  };
};

export function PaymentReceipt({ receipt }: { receipt: ReceiptData }) {
  const fee = receipt.parkingFee;
  const receiptNo = `ALF-${fee.year}${String(fee.month).padStart(2, "0")}-${receipt.id.slice(-6).toUpperCase()}`;

  return (
    <article className="print-area mx-auto w-full max-w-[640px] overflow-hidden rounded-3xl border border-border bg-card shadow-lift print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <header className="ink-surface flex items-center justify-between gap-4 px-6 py-6 text-white sm:px-8 print:bg-ink">
        <AlifLogo tone="light" subtitle="Parking receipt" />
        <div className="text-right">
          <p className="text-[10px] tracking-[0.2em] text-white/50 uppercase">Receipt no.</p>
          <p className="font-mono text-xs font-semibold whitespace-nowrap sm:text-sm">{receiptNo}</p>
        </div>
      </header>

      <div className="px-6 py-6 sm:px-8">
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-success-soft px-4 py-5 text-center">
          <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-success uppercase">
            <BadgeCheck className="size-4" /> Payment received
          </span>
          <p className="text-4xl font-bold tracking-tight tabular">{formatINR(receipt.amount, { precise: true })}</p>
          <p className="text-xs text-muted-foreground">Paid {formatDateTime(receipt.paidAt)}</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Section title="Billed to">
            <Line label="Name" value={fee.user.name} />
            <Line label="Email" value={fee.user.email} />
          </Section>
          <Section title="Parking">
            <Line label="Vehicle" value={fee.vehicle.number} mono />
            <Line label="Category" value={fee.vehicle.category.name} />
            <Line label="Billing month" value={formatBillingPeriod(fee.month, fee.year)} />
          </Section>
        </div>

        <Section title="Payment" className="mt-6">
          <Line label="Transaction ID" value={receipt.paymentId ?? "—"} mono />
          <Line label="Reference" value={receipt.id} mono />
          <Line label="Method" value={`${(receipt.paymentMethod ?? "UPI").toUpperCase()}${receipt.vpa ? ` · ${receipt.vpa}` : ""}`} />
          <Line label="Status" value="Paid" />
        </Section>

        <table className="mt-6 w-full text-sm">
          <tbody>
            <tr className="border-t border-border">
              <td className="py-2.5 text-muted-foreground">Monthly parking fee</td>
              <td className="py-2.5 text-right tabular">{formatINR(fee.baseAmount, { precise: true })}</td>
            </tr>
            {fee.lateFee ? (
              <tr className="border-t border-border">
                <td className="py-2.5 text-muted-foreground">Late fee</td>
                <td className="py-2.5 text-right tabular">{formatINR(fee.lateFee, { precise: true })}</td>
              </tr>
            ) : null}
            <tr className="border-t-2 border-foreground">
              <td className="py-3 font-bold">Total paid</td>
              <td className="py-3 text-right text-lg font-bold tabular">{formatINR(receipt.amount, { precise: true })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className="border-t border-dashed border-border px-6 py-4 text-center text-[11px] text-muted-foreground sm:px-8">
        This is a system-generated receipt from {COMPANY_NAME} and does not require a signature.
      </footer>
    </article>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="eyebrow mb-2 text-muted-foreground">{title}</h3>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate text-right font-mono text-xs font-semibold" : "truncate text-right font-medium"}>{value}</dd>
    </div>
  );
}
