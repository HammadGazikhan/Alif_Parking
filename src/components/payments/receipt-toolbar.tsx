"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReceiptToolbar({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="no-print mx-auto flex w-full max-w-[640px] items-center justify-between gap-3">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={backHref}>
          <ArrowLeft /> {backLabel}
        </Link>
      </Button>
      <Button variant="ink" onClick={() => window.print()}>
        <Printer /> Print / Save PDF
      </Button>
    </div>
  );
}
