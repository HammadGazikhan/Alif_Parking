import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, CalendarClock, CarFront, Mail, Phone } from "lucide-react";
import { PageContainer, SectionCard } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { AddVehicleButton, EditVehicleButton, EmployeeDetailActions } from "@/components/employees/employee-detail-actions";
import { VehicleTypeIcon } from "@/components/vehicles/vehicles-table";
import { requireAdminPage } from "@/server/auth/guards";
import { getEmployee } from "@/server/services/employee.service";
import { NotFoundError } from "@/server/errors";
import { formatBillingPeriod, formatDate, formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { listCategories } from "@/server/services/category.service";

export const metadata: Metadata = { title: "Employee" };

async function load(id: string) {
  try {
    return await getEmployee(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export default async function EmployeeDetailPage({ params }: PageProps<"/admin/employees/[id]">) {
  await requireAdminPage();
  const { id } = await params;
  const [employee, categories] = await Promise.all([
    load(id),
    listCategories().then((rows) => rows.map((c) => ({ id: c.id, name: c.name, active: c.active }))),
  ]);

  const fees = employee.parkingFees.filter((f) => f.status !== "CANCELLED");
  const paid = fees.filter((f) => f.status === "PAID");
  const unpaid = fees.filter((f) => f.status === "DUE" || f.status === "OVERDUE");
  const owner = { id: employee.id, name: employee.name };

  const info = [
    { icon: Mail, label: "Work email", value: employee.email },
    { icon: Briefcase, label: "Designation", value: employee.designation ?? "—" },
    { icon: Phone, label: "Phone", value: employee.phone ?? "—" },
    { icon: CalendarClock, label: "Last sign-in", value: formatDateTime(employee.lastLoginAt, "Never") },
  ];

  return (
    <PageContainer>
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link href="/admin/employees">
          <ArrowLeft /> All employees
        </Link>
      </Button>

      <div className="surface-card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 animate-fade-up">
        <div className="flex items-center gap-4">
          <InitialsAvatar
            name={employee.name}
            size="lg"
            src={employee.avatarType ? `/api/employees/${employee.id}/avatar` : undefined}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{employee.name}</h1>
              <StatusBadge status={employee.status} />
              {employee.parkingEligible ? (
                <StatusBadge label="Parking enabled" tone="gold" />
              ) : (
                <StatusBadge label="Parking disabled" tone="neutral" />
              )}
              {employee.role === "ADMIN" ? <StatusBadge label="Administrator" tone="gold" /> : null}
              {employee.freePass ? <StatusBadge label="Free pass" tone="info" /> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {employee.email} · Joined {formatDate(employee.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <EmployeeDetailActions
            employee={{
              id: employee.id,
              name: employee.name,
              email: employee.email,
              phone: employee.phone,
              designation: employee.designation,
              avatarType: employee.avatarType,
              parkingEligible: employee.parkingEligible,
              freePass: employee.freePass,
              status: employee.status,
              role: employee.role,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Employee information" contentClassName="p-5 sm:p-6">
          <dl className="space-y-4">
            {info.map((row) => (
              <div key={row.label} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <row.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{row.label}</dt>
                  <dd className="truncate text-sm font-medium">{row.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </SectionCard>

        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="Vehicles"
            description={`${employee.vehicles.length} registered`}
            actions={<AddVehicleButton user={owner} categories={categories} />}
          >
            {employee.vehicles.length ? (
              <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
                {employee.vehicles.map((v) => (
                  <li key={v.id} className="flex items-start gap-3 rounded-xl border border-border p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-gold">
                      <VehicleTypeIcon type={v.category.name} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-mono font-bold tracking-wide">{v.number}</p>
                        <StatusBadge status={v.status} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{v.category.name}</p>
                    </div>
                    <EditVehicleButton
                      vehicle={{ id: v.id, userId: v.userId, number: v.number, categoryId: v.categoryId, status: v.status }}
                      user={owner}
                      categories={categories}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CarFront} title="No vehicle registered" description="Add a vehicle to include this employee in monthly billing." />
            )}
          </SectionCard>

          <SectionCard title="Payment summary" description="Last 12 billing periods">
            <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
              <SummaryStat label="Total paid" value={formatINR(paid.reduce((s, f) => s + f.amount, 0))} />
              <SummaryStat
                label="Outstanding"
                value={formatINR(unpaid.reduce((s, f) => s + f.amount, 0))}
                danger={unpaid.length > 0}
              />
              <SummaryStat label="Fees paid" value={`${paid.length}/${fees.length}`} />
            </div>
            {employee.parkingFees.length ? (
              <ul className="divide-y divide-border">
                {employee.parkingFees.map((fee) => (
                  <li key={fee.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{formatBillingPeriod(fee.month, fee.year)}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{fee.vehicle.number}</span> ·{" "}
                        {fee.paidAt ? `Paid ${formatDate(fee.paidAt)}` : `Due ${formatDate(fee.dueDate)}`}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular">{formatINR(fee.amount)}</p>
                    <StatusBadge status={fee.status} />
                    {fee.payments[0] ? (
                      <Button variant="ghost" size="xs" asChild>
                        <Link href={`/admin/payments/${fee.payments[0].id}/receipt`}>Receipt</Link>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No fees yet" description="Fees appear here once monthly fees are generated." />
            )}
          </SectionCard>
        </div>
      </div>
    </PageContainer>
  );
}

function SummaryStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="px-4 py-4 sm:px-6">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={danger ? "mt-1 text-lg font-bold text-danger tabular" : "mt-1 text-lg font-bold tabular"}>{value}</p>
    </div>
  );
}
