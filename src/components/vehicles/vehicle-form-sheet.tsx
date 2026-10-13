"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormField } from "@/components/shared/form-field";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { applyFieldErrors } from "@/lib/form-errors";
import { normalizeVehicleNumber } from "@/lib/vehicle";
import { vehicleFormSchema, type VehicleFormValues, type VehicleInput } from "@/lib/validations/vehicle";

export type EditableVehicle = {
  id: string;
  userId: string;
  number: string;
  categoryId: string;
  status: "ACTIVE" | "INACTIVE";
};

export type EmployeeOption = { id: string; name: string; email: string; status: string };
export type CategoryOption = { id: string; name: string; active: boolean };

type SaveResult = { feeCreatedFor: string | null };

function toDefaults(vehicle?: EditableVehicle, userId?: string, categoryId?: string): VehicleFormValues {
  return {
    userId: vehicle?.userId ?? userId ?? "",
    number: vehicle?.number ?? "",
    categoryId: vehicle?.categoryId ?? categoryId ?? "",
    status: vehicle?.status ?? "ACTIVE",
  };
}

export function VehicleFormSheet({
  open,
  onOpenChange,
  vehicle,
  employees,
  categories,
  fixedUser,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: EditableVehicle;
  employees?: EmployeeOption[];
  categories: CategoryOption[];
  /** When adding from an employee's page the owner is fixed. */
  fixedUser?: { id: string; name: string };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = !!vehicle;

  const defaultCategoryId = categories.find((c) => c.active)?.id ?? "";
  const form = useForm<VehicleFormValues, unknown, VehicleInput>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: toDefaults(vehicle, fixedUser?.id, defaultCategoryId),
  });
  const { errors } = form.formState;
  const number = useWatch({ control: form.control, name: "number" });
  const normalized = normalizeVehicleNumber(number ?? "");

  const mutation = useMutation({
    mutationFn: (values: VehicleInput) =>
      isEdit
        ? api<SaveResult>(`/api/vehicles/${vehicle.id}`, { method: "PATCH", body: values })
        : api<SaveResult>("/api/vehicles", { method: "POST", body: values }),
    onSuccess: (result, values) => {
      toast.success(isEdit ? `Vehicle ${values.number} updated` : `Vehicle ${values.number} added`, {
        description: result.feeCreatedFor ? `${result.feeCreatedFor} parking fee created` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (result.feeCreatedFor) {
        queryClient.invalidateQueries({ queryKey: ["parking-fees"] });
        queryClient.invalidateQueries({ queryKey: ["fee-generation-preview"] });
      }
      router.refresh();
      onOpenChange(false);
    },
    onError: (error) => {
      applyFieldErrors(error, form.setError);
      toast.error(errorMessage(error));
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (mutation.isPending) return;
        if (o) form.reset(toDefaults(vehicle, fixedUser?.id, defaultCategoryId));
        onOpenChange(o);
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-lg">{isEdit ? "Edit vehicle" : "Add vehicle"}</SheetTitle>
          <SheetDescription>
            {fixedUser ? `Register a vehicle for ${fixedUser.name}.` : "Vehicle numbers are stored in uppercase without spaces."}
          </SheetDescription>
        </SheetHeader>

        <form
          id="vehicle-form"
          noValidate
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="flex-1 space-y-4 overflow-y-auto px-6 py-5"
        >
          {fixedUser ? null : (
            <FormField label="Employee" error={errors.userId?.message} required>
              <Controller
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label="Employee" aria-invalid={!!errors.userId}>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(employees ?? []).map((e) => (
                        <SelectItem key={e.id} value={e.id} disabled={e.status !== "ACTIVE" && e.id !== field.value}>
                          {e.name} <span className="text-xs text-muted-foreground">· {e.email}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_160px]">
            <FormField
              label="Vehicle number"
              htmlFor="number"
              error={errors.number?.message}
              hint={number && normalized !== number ? <>Will be saved as <span className="font-mono font-semibold">{normalized}</span></> : "e.g. MH12AB1234"}
              required
            >
              <Input
                id="number"
                placeholder="MH12AB1234"
                className="font-mono tracking-wider uppercase"
                autoCapitalize="characters"
                aria-invalid={!!errors.number}
                {...form.register("number")}
              />
            </FormField>
            <FormField label="Category" error={errors.categoryId?.message} required>
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label="Vehicle category" aria-invalid={!!errors.categoryId}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories
                        .filter((c) => c.active || c.id === field.value)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id} disabled={!c.active}>
                            {c.name}
                            {c.active ? "" : " (inactive)"}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          </div>

          <FormField label="Status">
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active — billed monthly</SelectItem>
                    <SelectItem value="INACTIVE">Inactive — not billed</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </form>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="vehicle-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
            {isEdit ? "Save changes" : "Add vehicle"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
