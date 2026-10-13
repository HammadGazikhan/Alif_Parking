import type { Metadata } from "next";
import { Briefcase, CalendarClock, Mail, Phone, ShieldCheck } from "lucide-react";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page-header";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireEmployeePage } from "@/server/auth/guards";
import { getOwnProfile } from "@/server/services/employee-portal.service";
import { formatDate, formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Profile" };

export default async function EmployeeProfilePage() {
  const user = await requireEmployeePage();
  const profile = await getOwnProfile(user.id);

  const rows = [
    { icon: Mail, label: "Work email", value: profile.email },
    { icon: Briefcase, label: "Designation", value: profile.designation ?? "—" },
    { icon: Phone, label: "Phone", value: profile.phone ?? "—" },
    { icon: CalendarClock, label: "Member since", value: formatDate(profile.createdAt) },
    { icon: ShieldCheck, label: "Last sign-in", value: formatDateTime(profile.lastLoginAt, "—") },
  ];

  return (
    <PageContainer className="max-w-[900px]">
      <PageHeader eyebrow="Account" title="Profile" description="Your employee details as recorded by the administrator." />

      <section className="surface-card flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left animate-fade-up">
        <InitialsAvatar
          name={profile.name}
          size="lg"
          src={profile.avatarType ? `/api/employees/${profile.id}/avatar` : undefined}
        />
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{profile.name}</h2>
          {profile.designation ? <p className="text-sm text-muted-foreground">{profile.designation}</p> : null}
          <p className="text-sm text-muted-foreground">{profile.email}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
            <StatusBadge status={profile.status} />
            {profile.parkingEligible ? (
              <StatusBadge label="Parking enabled" tone="gold" />
            ) : (
              <StatusBadge label="Parking disabled" tone="neutral" />
            )}
            {profile.freePass ? <StatusBadge label="Free pass" tone="info" /> : null}
          </div>
        </div>
      </section>

      <SectionCard title="Details">
        <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 px-5 py-4 sm:border-b sm:border-border sm:px-6 sm:odd:border-r">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <r.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{r.label}</dt>
                <dd className="truncate text-sm font-semibold">{r.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </SectionCard>

      <p className="text-center text-xs text-muted-foreground sm:text-left">
        You sign in with your Microsoft work account. Contact the parking administrator to update your details.
      </p>
    </PageContainer>
  );
}
