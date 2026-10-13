import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CarFront, CheckCircle2, ChevronRight, IndianRupee, ReceiptText, Wallet } from "lucide-react";
import { PageContainer, SectionCard } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { StatCard } from "@/components/dashboard/stat-card";
import { FeeHeroCard } from "@/components/employee/fee-hero-card";
import { Button } from "@/components/ui/button";
import { requireEmployeePage } from "@/server/auth/guards";
import { getEmployeeOverview } from "@/server/services/employee-portal.service";
import { markOverdueFees } from "@/server/services/parking-fee.service";
import { formatBillingPeriod, formatDate, formatDateLong, greetingFor } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = { title: "My Parking" };

export default async function EmployeeDashboardPage() {
  const user = await requireEmployeePage();
  await markOverdueFees();
  const data = await getEmployeeOverview(user.id);

  const heroFees = data.unpaid.length ? data.unpaid : data.currentFees;
  const [primary, ...others] = heroFees;
  const otherUnpaid = data.unpaid.length ? others : [];

  return (
    <PageContainer className="max-w-[1100px]">
      <div className="animate-fade-up">
        <p className="text-sm text-muted-foreground">{formatDateLong(new Date())}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {greetingFor()}, {user.name.split(" ")[0]}
        </h1>
      </div>

      {primary ? (
        <FeeHeroCard fee={primary} />
      ) : (
        <section className="surface-card animate-fade-up">
          <EmptyState
            icon={data.vehicles.length ? CheckCircle2 : CarFront}
            title={data.vehicles.length ? "Nothing to pay right now" : "No vehicle registered"}
            description={
              data.vehicles.length
                ? `Your ${formatBillingPeriod(data.period.month, data.period.year)} parking fee hasn't been generated yet. We'll notify you when it's due.`
                : "Contact the parking administrator to register your vehicle."
            }
          />
        </section>
      )}

      {otherUnpaid.length ? (
        <SectionCard title="Also outstanding" description="Clear older fees to avoid further late charges">
          <ul className="divide-y divide-border">
            {otherUnpaid.map((fee) => (
              <li key={fee.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{formatBillingPeriod(fee.month, fee.year)}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{fee.vehicle.number}</span> · due {formatDate(fee.dueDate)}
                  </p>
                </div>
                <StatusBadge status={fee.status} />
                <Button size="sm" asChild>
                  <Link href={`/employee/pay/${fee.id}`}>
                    Pay {formatINR(fee.amount)}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={`Paid in ${data.period.year}`}
          value={data.paidThisYear}
          format="currency"
          icon={<IndianRupee />}
          hint={`${data.paidCountThisYear} payment${data.paidCountThisYear === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Outstanding"
          value={data.outstanding}
          format="currency"
          icon={<Wallet />}
          delay={60}
          hint={data.unpaid.length ? `${data.unpaid.length} unpaid fee${data.unpaid.length === 1 ? "" : "s"}` : "You're all caught up"}
        />
        <Link href="/employee/vehicle" className="block">
          <div className="surface-card group flex h-full items-center gap-4 p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift animate-fade-up [animation-delay:120ms]">
            <span className="flex size-11 items-center justify-center rounded-xl bg-ink text-gold">
              <CarFront className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground">My vehicle</p>
              <p className="truncate font-mono text-lg font-bold tracking-wide">
                {data.vehicles[0]?.number ?? "Not registered"}
              </p>
              {data.vehicles.length > 1 ? (
                <p className="text-xs text-muted-foreground">+{data.vehicles.length - 1} more</p>
              ) : null}
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      </div>

      <SectionCard
        title="Recent payments"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/employee/payments">
              View all <ArrowRight />
            </Link>
          </Button>
        }
      >
        {data.recent.length ? (
          <ul className="divide-y divide-border">
            {data.recent.map((fee) => (
              <li key={fee.id}>
                <Link
                  href={fee.payments[0] ? `/employee/payments/${fee.payments[0].id}/receipt` : "/employee/payments"}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40 sm:px-6"
                >
                  <span className="flex size-9 items-center justify-center rounded-xl bg-success-soft text-success">
                    <ReceiptText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{formatBillingPeriod(fee.month, fee.year)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Paid {formatDate(fee.paidAt)}
                      {fee.payments[0]?.paymentId ? <span className="font-mono"> · {fee.payments[0].paymentId}</span> : null}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular">{formatINR(fee.amount)}</p>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No payments yet" description="Your completed parking payments will appear here." />
        )}
      </SectionCard>
    </PageContainer>
  );
}
