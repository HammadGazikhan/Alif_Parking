"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CalendarPlus, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { currentPeriod, formatBillingPeriod, formatDateLong, periodKey, shiftPeriod } from "@/lib/dates";
import { errorMessage } from "@/lib/error-message";
import { formatINR } from "@/lib/money";

type Preview = {
  month: number;
  year: number;
  period: string;
  feesEnabled: boolean;
  dueDate: string;
  eligibleEmployees: number;
  eligibleVehicles: number;
  alreadyGenerated: number;
  toGenerate: number;
  expectedCollection: number;
};

type GenerateResult = { period: string; created: number; skipped: number };

export function GenerateFeesButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <CalendarPlus /> Generate monthly fees
      </Button>
      {open ? <GenerateFeesDialog open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

function GenerateFeesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = currentPeriod();
  const options = useMemo(
    () => [1, 0, -1, -2].map((d) => shiftPeriod(now, d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now.month, now.year],
  );
  const [selected, setSelected] = useState(String(periodKey(now)));
  const [step, setStep] = useState<"review" | "confirm">("review");
  const period = options.find((p) => String(periodKey(p)) === selected) ?? now;

  const preview = useQuery({
    queryKey: ["fee-generation-preview", period.month, period.year],
    queryFn: () => api<Preview>("/api/parking-fees/generate", { query: period }),
  });

  const generate = useMutation({
    mutationFn: () => api<GenerateResult>("/api/parking-fees/generate", { method: "POST", body: period }),
    onSuccess: (result) => {
      toast.success(
        result.created
          ? `Generated ${result.created} fee${result.created === 1 ? "" : "s"} for ${result.period}`
          : `All fees for ${result.period} were already generated`,
        { description: result.skipped ? `${result.skipped} existing fee(s) were skipped.` : undefined },
      );
      queryClient.invalidateQueries({ queryKey: ["parking-fees"] });
      queryClient.invalidateQueries({ queryKey: ["fee-generation-preview"] });
      router.refresh();
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setStep("review");
    },
  });

  const data = preview.data;
  const canGenerate = !!data && data.feesEnabled && data.toGenerate > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !generate.isPending && onOpenChange(o)}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gold-soft text-gold-strong">
              <Sparkles className="size-4" />
            </span>
            {step === "review" ? "Generate monthly fees" : "Confirm fee generation"}
          </DialogTitle>
          <DialogDescription>
            {step === "review"
              ? "Creates one fee per active vehicle of every active, parking-eligible employee. Existing fees are never duplicated."
              : "Please review before continuing. Employees will be notified immediately."}
          </DialogDescription>
        </DialogHeader>

        {step === "review" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Billing month</label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((p) => (
                    <SelectItem key={periodKey(p)} value={String(periodKey(p))}>
                      {formatBillingPeriod(p.month, p.year)}
                      {periodKey(p) === periodKey(now) ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {preview.isPending ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] rounded-xl" />
                ))}
              </div>
            ) : preview.isError ? (
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{errorMessage(preview.error)}</p>
            ) : data ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <PreviewStat label="Eligible employees" value={String(data.eligibleEmployees)} />
                  <PreviewStat label="Eligible vehicles" value={String(data.eligibleVehicles)} />
                  <PreviewStat label="Already generated" value={String(data.alreadyGenerated)} />
                  <PreviewStat label="New fees" value={String(data.toGenerate)} highlight />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Expected collection</p>
                    <p className="text-lg font-bold tabular">{formatINR(data.expectedCollection)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Due date</p>
                    <p className="text-sm font-semibold">{formatDateLong(data.dueDate)}</p>
                  </div>
                </div>
                {!data.feesEnabled ? (
                  <Notice tone="danger">Parking fees are disabled in settings. Enable them to generate fees.</Notice>
                ) : data.toGenerate === 0 ? (
                  <Notice tone="success">All fees for {data.period} have already been generated.</Notice>
                ) : null}
              </>
            ) : null}
          </div>
        ) : data ? (
          <div className="space-y-3 rounded-xl border border-gold/40 bg-gold-soft/60 p-4 text-sm">
            <p>
              You are about to create <strong className="tabular">{data.toGenerate}</strong> parking fee
              {data.toGenerate === 1 ? "" : "s"} for <strong>{data.period}</strong> totalling{" "}
              <strong className="tabular">{formatINR(data.expectedCollection)}</strong>.
            </p>
            <p className="text-muted-foreground">
              Fees are due by {formatDateLong(data.dueDate)}. Each affected employee receives a payment-due notification.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          {step === "review" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!canGenerate} onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("review")} disabled={generate.isPending}>
                <ArrowLeft /> Back
              </Button>
              <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                {generate.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Generate {data?.toGenerate} fee{data?.toGenerate === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={highlight ? "rounded-xl bg-ink p-3.5 text-white" : "rounded-xl border border-border p-3.5"}>
      <p className={highlight ? "text-[11px] text-white/60" : "text-[11px] text-muted-foreground"}>{label}</p>
      <p className={highlight ? "mt-1 text-xl font-bold text-gold tabular" : "mt-1 text-xl font-bold tabular"}>{value}</p>
    </div>
  );
}

function Notice({ tone, children }: { tone: "danger" | "success"; children: React.ReactNode }) {
  const Icon = tone === "danger" ? AlertTriangle : CheckCircle2;
  return (
    <p
      className={
        tone === "danger"
          ? "flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
          : "flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}
