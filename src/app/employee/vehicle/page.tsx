import type { Metadata } from "next";
import { CarFront, Info } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { VehicleTypeIcon } from "@/components/vehicles/vehicles-table";
import { requireEmployeePage } from "@/server/auth/guards";
import { getOwnProfile } from "@/server/services/employee-portal.service";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "My Vehicle" };

export default async function EmployeeVehiclePage() {
  const user = await requireEmployeePage();
  const profile = await getOwnProfile(user.id);

  return (
    <PageContainer className="max-w-[900px]">
      <PageHeader eyebrow="My parking" title="My vehicle" description="Vehicles registered to you for office parking." />

      {profile.vehicles.length ? (
        <div className="space-y-4">
          {profile.vehicles.map((v, i) => (
            <article
              key={v.id}
              className="surface-card overflow-hidden animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="ink-surface relative flex items-center justify-between gap-4 p-5 text-white sm:p-6">
                <div className="flex items-center gap-4">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-gold text-ink">
                    <VehicleTypeIcon type={v.category.name} className="size-6" />
                  </span>
                  <div>
                    <p className="text-xs text-white/60">{v.category.name}</p>
                    <p className="font-mono text-2xl font-bold tracking-[0.12em]">{v.number}</p>
                  </div>
                </div>
                <StatusBadge status={v.status} size="lg" />
              </div>
              <p className="px-5 py-3 text-xs text-muted-foreground sm:px-6">
                Registered {formatDate(v.createdAt)}
                {v.status === "INACTIVE" ? " · Not billed while inactive" : " · Billed monthly"}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="surface-card">
          <EmptyState icon={CarFront} title="No vehicle registered" description="Ask the parking administrator to register your vehicle." />
        </div>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-gold-strong" />
        Need to change your vehicle? Contact the parking administrator — vehicle details can only be updated by admins.
      </p>
    </PageContainer>
  );
}
