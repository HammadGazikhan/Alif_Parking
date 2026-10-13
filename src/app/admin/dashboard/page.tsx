import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Car, CircleAlert, IndianRupee, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { CollectionChart } from "@/components/dashboard/collection-chart";
import { StatusDonut } from "@/components/dashboard/status-donut";
import { RemindButton } from "@/components/dashboard/remind-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/server/auth/guards";
import { markOverdueFees } from "@/server/services/parking-fee.service";
import {
  getDashboardStats,
  getDueFees,
  getMonthlyCollection,
  getRecentFeeActivity,
  getStatusBreakdown,
} from "@/server/services/report.service";
import { formatBillingPeriod, formatDate, formatDayMonth, greetingFor } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { GenerateFeesButton } from "@/components/parking/generate-fees-dialog";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const user = await requireAdminPage();
  await markOverdueFees();

  const [stats, monthly, breakdown, recent, due] = await Promise.all([
    getDashboardStats(),
    getMonthlyCollection({}),
    getStatusBreakdown(),
    getRecentFeeActivity(6),
    getDueFees(6),
  ]);

  const periodLabel = formatBillingPeriod(stats.period.month, stats.period.year);
  const delta = stats.paidLastMonth ? Math.round(((stats.paidThisMonth - stats.paidLastMonth) / stats.paidLastMonth) * 100) : null;

  return (
    <PageContainer>
      <PageHeader
        eyebrow={periodLabel}
        title={`${greetingFor()}, ${user.name.split(" ")[0]}`}
        description="Here's how parking collections are tracking this month."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/reports">
                View reports <ArrowUpRight />
              </Link>
            </Button>
            <GenerateFeesButton />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="ink"
          label="Collected this month"
          value={stats.paidThisMonth}
          format="currency"
          icon={<IndianRupee />}
          hint={
            <span className="flex items-center gap-1.5">
              {delta !== null ? (
                <span className={delta >= 0 ? "flex items-center gap-1 text-gold" : "flex items-center gap-1 text-white/80"}>
                  {delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                  {delta >= 0 ? "+" : ""}
                  {delta}%
                </span>
              ) : null}
              <span>{stats.collectionRate}% of {formatINR(stats.expectedThisMonth)} expected</span>
            </span>
          }
        />
        <StatCard
          label="Outstanding"
          value={stats.outstanding}
          format="currency"
          icon={<Wallet />}
          delay={60}
          hint={
            <span>
              {stats.outstandingCount} unpaid fee{stats.outstandingCount === 1 ? "" : "s"}
              {stats.overdueCount ? (
                <span className="ml-1.5 font-semibold text-danger">· {stats.overdueCount} overdue</span>
              ) : null}
            </span>
          }
        />
        <StatCard
          label="Active employees"
          value={stats.totalEmployees}
          icon={<Users />}
          delay={120}
          hint={stats.newEmployees ? `+${stats.newEmployees} joined in the last 30 days` : "No new joiners this month"}
        />
        <StatCard
          label="Registered vehicles"
          value={stats.activeVehicles}
          icon={<Car />}
          delay={180}
          hint={`${stats.paidCountThisMonth} paid for ${formatBillingPeriod(stats.period.month, stats.period.year, true)}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Monthly collection"
          description="Collected vs outstanding over the last 6 months"
          contentClassName="px-3 pt-4 pb-3 sm:px-5"
        >
          <CollectionChart data={monthly} />
        </SectionCard>
        <SectionCard title="Payment status" description={periodLabel} contentClassName="p-5">
          <StatusDonut breakdown={breakdown} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Recent activity"
          description={`Latest fee updates for ${periodLabel}`}
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/payments">
                All payments <ArrowRight />
              </Link>
            </Button>
          }
        >
          {recent.length ? (
            <ul className="divide-y divide-border">
              {recent.map((fee) => (
                <li key={fee.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <InitialsAvatar name={fee.user.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{fee.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{fee.vehicle.number}</span>
                      {" · "}
                      {fee.paidAt ? `Paid ${formatDayMonth(fee.paidAt)}` : `Due ${formatDate(fee.dueDate)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular">{formatINR(fee.amount)}</p>
                    <StatusBadge status={fee.status} className="mt-1" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No fees for this month yet"
              description="Generate this month's parking fees to start collecting."
              action={<GenerateFeesButton />}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Due & overdue"
          description="Oldest unpaid fees first"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/parking-fees?status=OVERDUE">
                View all <ArrowRight />
              </Link>
            </Button>
          }
        >
          {due.length ? (
            <ul className="divide-y divide-border">
              {due.map((fee) => (
                <li key={fee.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <span
                    className={
                      fee.status === "OVERDUE"
                        ? "flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger"
                        : "flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning"
                    }
                  >
                    <CircleAlert className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{fee.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatBillingPeriod(fee.month, fee.year, true)} · {formatINR(fee.amount)}
                      {fee.daysOverdue ? (
                        <span className="font-semibold text-danger"> · {fee.daysOverdue}d overdue</span>
                      ) : (
                        <span> · due {formatDayMonth(fee.dueDate)}</span>
                      )}
                    </p>
                  </div>
                  <RemindButton feeId={fee.id} name={fee.user.name} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="All caught up" description="There are no unpaid parking fees right now." />
          )}
        </SectionCard>
      </div>
    </PageContainer>
  );
}
