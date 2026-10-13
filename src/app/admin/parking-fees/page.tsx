import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Settings2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { ParkingFeesTable } from "@/components/parking/parking-fees-table";
import { GenerateFeesButton } from "@/components/parking/generate-fees-dialog";
import { Button } from "@/components/ui/button";
import { currentPeriod } from "@/lib/dates";
import { requireAdminPage } from "@/server/auth/guards";
import { markOverdueFees } from "@/server/services/parking-fee.service";

export const metadata: Metadata = { title: "Parking Fees" };

export default async function ParkingFeesPage({ searchParams }: PageProps<"/admin/parking-fees">) {
  await requireAdminPage();
  await markOverdueFees();
  const { status } = await searchParams;
  const period = currentPeriod();
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Billing"
        title="Parking fees"
        description="Track monthly parking fees across employees and vehicles."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/reports/pass-list?month=${period.month}&year=${period.year}`} download>
                <FileSpreadsheet /> CHP pass list
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/settings/parking">
                <Settings2 /> Fee settings
              </Link>
            </Button>
            <GenerateFeesButton />
          </>
        }
      />
      <ParkingFeesTable initialStatus={typeof status === "string" ? status : undefined} />
    </PageContainer>
  );
}
