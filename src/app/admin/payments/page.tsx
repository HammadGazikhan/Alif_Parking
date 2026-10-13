import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { PaymentsTable } from "@/components/payments/payments-table";
import { requireAdminPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Payments" };

export default async function AdminPaymentsPage() {
  await requireAdminPage();
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Billing"
        title="Payments"
        description="Every payment attempt as confirmed by the payment gateway, including failed and expired attempts."
      />
      <PaymentsTable />
    </PageContainer>
  );
}
