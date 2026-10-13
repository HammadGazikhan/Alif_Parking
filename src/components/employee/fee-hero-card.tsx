import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, CircleAlert, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { VehicleTypeIcon } from "@/components/vehicles/vehicles-table";
import { daysOverdue, formatBillingPeriod, formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { EmployeeFee } from "@/server/services/employee-portal.service";

/** The primary "Your Parking" card on the employee dashboard. */
export function FeeHeroCard({ fee }: { fee: EmployeeFee }) {
  const paid = fee.status === "PAID";
  const overdue = fee.status === "OVERDUE";
  const receipt = fee.payments[0];
  const late = overdue ? daysOverdue(fee.dueDate) : 0;

  return (
    <section className="ink-surface relative overflow-hidden rounded-3xl p-5 text-white shadow-lift animate-fade-up sm:p-7">
      <div className="bay-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-gold">Your parking</p>
            <p className="mt-1 text-sm text-white/60">{formatBillingPeriod(fee.month, fee.year)}</p>
          </div>
          <StatusBadge status={fee.status} size="lg" className={paid ? "" : overdue ? "" : "bg-gold text-ink ring-gold"} />
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-white/50">{paid ? "Amount paid" : "Amount due"}</p>
            <p className="mt-1 text-4xl font-bold tracking-tight tabular sm:text-5xl">{formatINR(fee.amount)}</p>
            {fee.lateFee ? (
              <p className="mt-1 text-xs text-white/60 tabular">
                {formatINR(fee.baseAmount)} + {formatINR(fee.lateFee)} late fee
              </p>
            ) : null}
          </div>
          <div className="hidden items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:flex">
            <VehicleTypeIcon type={fee.vehicle.category.name} className="size-5 text-gold" />
            <span className="font-mono text-base font-bold tracking-wider">{fee.vehicle.number}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 sm:hidden">
            <VehicleTypeIcon type={fee.vehicle.category.name} className="size-4 text-gold" />
            <span className="font-mono text-xs font-bold tracking-wider">{fee.vehicle.number}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5">
            <CalendarDays className="size-4 shrink-0 text-gold" />
            <span className="truncate text-xs">
              {paid && fee.paidAt ? `Paid ${formatDate(fee.paidAt)}` : `Due ${formatDate(fee.dueDate)}`}
            </span>
          </div>
        </div>

        {overdue ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/15 px-3 py-2.5 text-xs text-white">
            <CircleAlert className="size-4 shrink-0 text-[#ff8a8a]" />
            Overdue by {late} day{late === 1 ? "" : "s"}. Please pay as soon as possible.
          </p>
        ) : null}

        <div className="mt-6">
          {paid ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-white/80">
                <CheckCircle2 className="size-5 text-gold" /> You&apos;re all set for this month.
              </p>
              {receipt ? (
                <Button variant="glass" asChild>
                  <Link href={`/employee/payments/${receipt.id}/receipt`}>
                    <ReceiptText /> View receipt
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <Button size="xl" className="w-full text-base sm:w-auto sm:min-w-56" asChild>
              <Link href={`/employee/pay/${fee.id}`}>
                Pay {formatINR(fee.amount)} now <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
