import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { ReportsView } from "@/components/reports/reports-view";
import { requireAdminPage } from "@/server/auth/guards";
import { listEmployeeOptions } from "@/server/services/employee.service";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireAdminPage();
  const employees = await listEmployeeOptions();
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        description="Collection performance by month and employee. Export to CSV or Excel."
      />
      <ReportsView employees={employees.map((e) => ({ id: e.id, name: e.name, email: e.email }))} />
    </PageContainer>
  );
}
