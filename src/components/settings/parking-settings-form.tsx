"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { IndianRupee, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/page-header";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { applyFieldErrors } from "@/lib/form-errors";
import { formatINR } from "@/lib/money";
import { parkingSettingsSchema, type ParkingSettingsInput } from "@/lib/validations/parking";

export function ParkingSettingsForm({ initial }: { initial: ParkingSettingsInput }) {
  const router = useRouter();
  const form = useForm<ParkingSettingsInput>({
    resolver: zodResolver(parkingSettingsSchema),
    defaultValues: initial,
  });
  const { errors, isDirty } = form.formState;
  const [lateFee, dueDay] = useWatch({ control: form.control, name: ["lateFee", "dueDay"] });

  const mutation = useMutation({
    mutationFn: (values: ParkingSettingsInput) => api("/api/settings/parking", { method: "PUT", body: values }),
    onSuccess: (_r, values) => {
      toast.success("Parking settings saved", { description: "New values apply to fees generated from now on." });
      form.reset(values);
      router.refresh();
    },
    onError: (e) => {
      applyFieldErrors(e, form.setError);
      toast.error(errorMessage(e));
    },
  });

  const rupeeInput = (name: "lateFee", id: string) => (
    <div className="relative">
      <IndianRupee className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="1"
        className="pl-9 tabular"
        aria-invalid={!!errors[name]}
        {...form.register(name, { valueAsNumber: true })}
      />
    </div>
  );

  return (
    <SectionCard title="Parking settings" description="The same due day and late fee apply to every vehicle category">
      <form noValidate onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-5 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField label="Monthly payment due day" htmlFor="dueDay" error={errors.dueDay?.message} hint="Between 1 and 28. End of that day, India time." required>
            <Input
              id="dueDay"
              type="number"
              min={1}
              max={28}
              className="tabular"
              aria-invalid={!!errors.dueDay}
              {...form.register("dueDay", { valueAsNumber: true })}
            />
          </FormField>
          <FormField label="Global late fee" htmlFor="lateFee" error={errors.lateFee?.message} hint="Added once, to every category, when a bill becomes overdue" required>
            {rupeeInput("lateFee", "lateFee")}
          </FormField>
        </div>

        <Controller
          control={form.control}
          name="feesEnabled"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3.5">
              <span>
                <span className="block text-sm font-semibold">Parking fees enabled</span>
                <span className="block text-xs text-muted-foreground">
                  When disabled, monthly fee generation is blocked. Existing fees can still be paid.
                </span>
              </span>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />

        <div className="flex flex-col gap-3 rounded-xl bg-ink px-4 py-3.5 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Every bill is due by day <span className="font-semibold text-white tabular">{Number(dueDay) || "–"}</span>. A late fee of{" "}
            <span className="font-semibold text-gold tabular">{formatINR(Math.round((Number(lateFee) || 0) * 100))}</span> is added once
            if it is still unpaid.
          </p>
          <Button type="submit" disabled={!isDirty || mutation.isPending} className="shrink-0">
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save settings
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
