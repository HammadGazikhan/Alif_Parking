import type { Metadata } from "next";
import { PageContainer } from "@/components/shared/page-header";
import { PaymentReceipt } from "@/components/payments/payment-receipt";
import { ReceiptToolbar } from "@/components/payments/receipt-toolbar";
import { requireEmployeePage } from "@/server/auth/guards";
import { loadReceiptForPage } from "@/server/services/receipt-page";

export const metadata: Metadata = { title: "Receipt" };

export default async function EmployeeReceiptPage({ params }: PageProps<"/employee/payments/[id]/receipt">) {
  const user = await requireEmployeePage();
  const { id } = await params;
  const receipt = await loadReceiptForPage(user, id);
  return (
    <PageContainer className="max-w-[760px]">
      <ReceiptToolbar backHref="/employee/payments" backLabel="Payment history" />
      <PaymentReceipt receipt={receipt} />
    </PageContainer>
  );
}
