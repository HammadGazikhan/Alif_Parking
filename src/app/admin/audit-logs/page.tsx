import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { AuditLogTable } from "@/components/audit/audit-log-table";
import { requireAdminPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Audit Log" };

export default async function AuditLogsPage() {
  await requireAdminPage();
  return (
    <PageContainer>
      <PageHeader
        eyebrow="System"
        title="Audit log"
        description="A tamper-evident trail of administrative actions and payment status changes."
      />
      <AuditLogTable />
    </PageContainer>
  );
}
