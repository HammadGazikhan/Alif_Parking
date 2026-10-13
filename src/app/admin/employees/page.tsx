import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { EmployeesTable } from "@/components/employees/employees-table";
import { requireAdminPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage() {
  await requireAdminPage();
  return (
    <PageContainer>
      <PageHeader
        eyebrow="People"
        title="Employees"
        description="Manage employee accounts, parking eligibility and assigned vehicles."
      />
      <EmployeesTable />
    </PageContainer>
  );
}
