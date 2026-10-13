import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { VehiclesTable } from "@/components/vehicles/vehicles-table";
import { requireAdminPage } from "@/server/auth/guards";
import { listEmployeeOptions } from "@/server/services/employee.service";
import { listCategories } from "@/server/services/category.service";

export const metadata: Metadata = { title: "Vehicles" };

export default async function VehiclesPage() {
  await requireAdminPage();
  const [employees, categories] = await Promise.all([listEmployeeOptions(), listCategories()]);
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Parking"
        title="Vehicles"
        description="Registered employee vehicles and their billing status."
      />
      <VehiclesTable
        employees={employees}
        categories={categories.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
      />
    </PageContainer>
  );
}
