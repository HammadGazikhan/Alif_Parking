import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ReceiptText, Wallet } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { requireEmployeePage } from "@/server/auth/guards";
import { listOwnFees } from "@/server/services/employee-portal.service";
import { formatBillingPeriod, formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payment History" };

export default async function EmployeePaymentsPage({ searchParams }: PageProps<"/employee/payments">) {
  const user = await requireEmployeePage();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(typeof pageParam === "string" ? pageParam : "1", 10) || 1);
  const data = await listOwnFees(user.id, page);

  return (
    <PageContainer className="max-w-[1000px]">
      <PageHeader eyebrow="My parking" title="Payment history" description="All your monthly parking fees and receipts." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="surface-card p-4 sm:p-5">
          <p className="text-xs font-semibold text-muted-foreground">Total paid</p>
          <p className="mt-2 text-xl font-bold tabular sm:text-2xl">{formatINR(data.summary.paid)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.summary.paidCount} payments</p>
        </div>
        <div className="surface-card p-4 sm:p-5">
          <p className="text-xs font-semibold text-muted-foreground">Outstanding</p>
          <p className={cn("mt-2 text-xl font-bold tabular sm:text-2xl", data.summary.outstanding && "text-danger")}>
            {formatINR(data.summary.outstanding)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{data.summary.outstandingCount} unpaid</p>
        </div>
      </div>

      <section className="surface-card overflow-hidden">
        {data.items.length ? (
          <>
            <div className="hidden grid-cols-[1.2fr_1fr_1fr_1.4fr_auto_auto] gap-4 border-b border-border bg-muted/40 px-6 py-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase md:grid">
              <span>Period</span>
              <span>Vehicle</span>
              <span>Amount</span>
              <span>Paid on / Transaction</span>
              <span>Status</span>
              <span className="w-24" />
            </div>
            <ul className="divide-y divide-border">
              {data.items.map((fee) => {
                const payment = fee.payments[0];
                const unpaid = fee.status === "DUE" || fee.status === "OVERDUE";
                return (
                  <li
                    key={fee.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-4 md:grid-cols-[1.2fr_1fr_1fr_1.4fr_auto_auto] md:px-6"
                  >
                    <div>
                      <p className="text-sm font-semibold">{formatBillingPeriod(fee.month, fee.year)}</p>
                      <p className="text-xs text-muted-foreground md:hidden">
                        <span className="font-mono">{fee.vehicle.number}</span> ·{" "}
                        {payment?.paidAt ? `Paid ${formatDate(payment.paidAt)}` : `Due ${formatDate(fee.dueDate)}`}
                      </p>
                    </div>
                    <span className="hidden font-mono text-xs font-semibold md:block">{fee.vehicle.number}</span>
                    <span className="text-right text-sm font-semibold tabular md:text-left">{formatINR(fee.amount)}</span>
                    <div className="hidden min-w-0 md:block">
                      {payment ? (
                        <>
                          <p className="text-sm">{formatDate(payment.paidAt)}</p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">{payment.paymentId}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Due {formatDate(fee.dueDate)}</p>
                      )}
                    </div>
                    <StatusBadge status={fee.status} />
                    <div className="flex justify-end md:w-24">
                      {payment ? (
                        <Button variant="outline" size="xs" asChild>
                          <Link href={`/employee/payments/${payment.id}/receipt`}>
                            <ReceiptText /> Receipt
                          </Link>
                        </Button>
                      ) : unpaid ? (
                        <Button size="xs" asChild>
                          <Link href={`/employee/pay/${fee.id}`}>Pay now</Link>
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {data.pageCount > 1 ? (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm sm:px-6">
                <span className="text-muted-foreground tabular">
                  Page {data.page} of {data.pageCount}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`?page=${data.page - 1}`} aria-disabled={data.page <= 1} className={cn(data.page <= 1 && "pointer-events-none opacity-50")}>
                      <ChevronLeft /> Prev
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`?page=${data.page + 1}`}
                      aria-disabled={data.page >= data.pageCount}
                      className={cn(data.page >= data.pageCount && "pointer-events-none opacity-50")}
                    >
                      Next <ChevronRight />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState icon={Wallet} title="No parking fees yet" description="Your monthly parking fees will appear here once generated." />
        )}
      </section>
    </PageContainer>
  );
}
