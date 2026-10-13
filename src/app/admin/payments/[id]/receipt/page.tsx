import type { Metadata } from "next";
import { PageContainer } from "@/components/shared/page-header";
import { PaymentReceipt } from "@/components/payments/payment-receipt";
import { ReceiptToolbar } from "@/components/payments/receipt-toolbar";
import { requireAdminPage } from "@/server/auth/guards";
import { loadReceiptForPage } from "@/server/services/receipt-page";

export const metadata: Metadata = { title: "Receipt" };

export default async function AdminReceiptPage({ params }: PageProps<"/admin/payments/[id]/receipt">) {
  const user = await requireAdminPage();
  const { id } = await params;
  const receipt = await loadReceiptForPage(user, id);
  return (
    <PageContainer className="max-w-[760px]">
      <ReceiptToolbar backHref="/admin/payments" backLabel="Payments" />
      <PaymentReceipt receipt={receipt} />
    </PageContainer>
  );
}
