import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, ReceiptText } from "lucide-react";
import { PageContainer } from "@/components/shared/page-header";
import { PayCheckout } from "@/components/payments/pay-checkout";
import { Button } from "@/components/ui/button";
import { requireEmployeePage } from "@/server/auth/guards";
import { isMockPaymentsEnabled } from "@/server/env";
import { getOwnFee } from "@/server/services/employee-portal.service";
import { markOverdueFees } from "@/server/services/parking-fee.service";
import { formatBillingPeriod, formatDateLong } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = { title: "Pay Parking Fee" };

export default async function PayPage({ params }: PageProps<"/employee/pay/[feeId]">) {
  const user = await requireEmployeePage();
  const { feeId } = await params;
  await markOverdueFees();
  const fee = await getOwnFee(user.id, feeId);
  if (!fee) notFound();

  const period = formatBillingPeriod(fee.month, fee.year);

  return (
    <PageContainer className="max-w-[960px]">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/employee/dashboard">
            <ArrowLeft /> Back
          </Link>
        </Button>
        <p className="text-xs font-medium text-muted-foreground">Due {formatDateLong(fee.dueDate)}</p>
      </div>
      <div className="animate-fade-up">
        <p className="eyebrow text-gold-strong">Parking fee</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Pay for {period}</h1>
      </div>

      {fee.status === "PAID" ? (
        <section className="surface-card mx-auto max-w-md px-6 py-10 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success-soft text-success">
            <CheckCircle2 className="size-7" />
          </span>
          <h2 className="mt-4 text-lg font-bold">Already paid</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your {period} parking fee of {formatINR(fee.amount)} has been paid.
          </p>
          {fee.payments[0] ? (
            <Button className="mt-6" asChild>
              <Link href={`/employee/payments/${fee.payments[0].id}/receipt`}>
                <ReceiptText /> View receipt
              </Link>
            </Button>
          ) : null}
        </section>
      ) : fee.status === "CANCELLED" ? (
        <section className="surface-card mx-auto max-w-md px-6 py-10 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Ban className="size-7" />
          </span>
          <h2 className="mt-4 text-lg font-bold">Fee cancelled</h2>
          <p className="mt-1 text-sm text-muted-foreground">This parking fee was cancelled by the administrator. Nothing to pay.</p>
        </section>
      ) : (
        <PayCheckout
          simulate={isMockPaymentsEnabled()}
          fee={{
            id: fee.id,
            period,
            vehicleNumber: fee.vehicle.number,
            amount: fee.amount,
            baseAmount: fee.baseAmount,
            lateFee: fee.lateFee,
            status: fee.status,
            dueDate: fee.dueDate.toISOString(),
          }}
        />
      )}
    </PageContainer>
  );
}
