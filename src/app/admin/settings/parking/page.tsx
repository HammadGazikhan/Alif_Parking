import type { Metadata } from "next";
import { History } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { ParkingSettingsForm } from "@/components/settings/parking-settings-form";
import { CategoriesCard } from "@/components/settings/categories-card";
import { requireAdminPage } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { listCategories } from "@/server/services/category.service";
import { getSettings } from "@/server/services/settings.service";
import { formatDateTime } from "@/lib/dates";
import { paiseToRupees } from "@/lib/money";

export const metadata: Metadata = { title: "Parking Settings" };

export default async function ParkingSettingsPage() {
  await requireAdminPage();
  const [settings, categories] = await Promise.all([getSettings(), listCategories()]);
  const updatedBy = settings.updatedById
    ? await prisma.user.findUnique({ where: { id: settings.updatedById }, select: { name: true } })
    : null;

  return (
    <PageContainer className="max-w-[1000px]">
      <PageHeader
        eyebrow="Settings"
        title="Parking settings"
        description="Due day and late fee apply to every category. Each category has its own monthly fee."
      />
      <ParkingSettingsForm
        initial={{
          dueDay: settings.dueDay,
          lateFee: paiseToRupees(settings.lateFee),
          feesEnabled: settings.feesEnabled,
        }}
      />
      <CategoriesCard categories={categories} />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <History className="size-3.5" />
        Last updated {formatDateTime(settings.updatedAt)}
        {updatedBy ? ` by ${updatedBy.name}` : ""}
      </p>
    </PageContainer>
  );
}
