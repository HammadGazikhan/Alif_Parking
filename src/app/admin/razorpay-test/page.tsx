import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { RazorpayTestConsole } from "@/components/payments/razorpay-test-console";
import { requireAdminPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Razorpay Test" };

export default async function RazorpayTestPage() {
  await requireAdminPage();

  return (
    <PageContainer className="max-w-[1000px]">
      <PageHeader eyebrow="Payments" title="Razorpay test" description="Validate the configured test account with a small Razorpay Checkout payment." />
      <RazorpayTestConsole />
    </PageContainer>
  );
}
