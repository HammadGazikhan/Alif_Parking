"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormField } from "@/components/shared/form-field";
import { DirectoryPersonPicker, type DirectoryPerson } from "@/components/employees/directory-person-picker";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { applyFieldErrors } from "@/lib/form-errors";
import {
  employeeCreateSchema,
  type EmployeeCreateInput,
  type EmployeeFormValues,
} from "@/lib/validations/employee";

export type EditableEmployee = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  avatarType: string | null;
  parkingEligible: boolean;
  freePass: boolean;
  status: "ACTIVE" | "INACTIVE";
};

type CreateResult = { employee: { id: string; name: string } };
type UpdateResult = { feeCreatedFor: string | null };

function toDefaults(employee?: EditableEmployee): EmployeeFormValues {
  return {
    email: employee?.email ?? "",
    name: employee?.name ?? "",
    phone: employee?.phone ?? "",
    designation: employee?.designation ?? "",
    parkingEligible: employee?.parkingEligible ?? true,
    freePass: employee?.freePass ?? false,
    status: employee?.status ?? "ACTIVE",
  };
}

export function EmployeeFormSheet({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: EditableEmployee;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = !!employee;
  const [person, setPerson] = useState<DirectoryPerson | null>(null);

  const form = useForm<EmployeeFormValues, unknown, EmployeeCreateInput>({
    resolver: zodResolver(employeeCreateSchema),
    defaultValues: toDefaults(employee),
  });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: async (values: EmployeeCreateInput) => {
      if (isEdit) {
        const { email: _email, ...rest } = values;
        void _email;
        return api<UpdateResult>(`/api/employees/${employee.id}`, { method: "PATCH", body: rest });
      }
      return api<CreateResult>("/api/employees", {
        method: "POST",
        body: { ...values, ...(person?.id ? { directoryId: person.id } : {}) },
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      router.refresh();
      onOpenChange(false);
      if (!isEdit) {
        const created = result as CreateResult;
        queryClient.invalidateQueries({ queryKey: ["directory-users"] });
        toast.success(`${created.employee.name} added`, {
          description: "They can now sign in with their Microsoft work account.",
        });
        form.reset(toDefaults());
        setPerson(null);
      } else {
        const { feeCreatedFor } = result as UpdateResult;
        toast.success("Employee updated", {
          description: feeCreatedFor ? `${feeCreatedFor} parking fee created` : undefined,
        });
        if (feeCreatedFor) queryClient.invalidateQueries({ queryKey: ["parking-fees"] });
      }
    },
    onError: (error) => {
      if (!applyFieldErrors(error, form.setError)) toast.error(errorMessage(error));
      else toast.error("Please fix the highlighted fields");
    },
  });

  const onSubmit = form.handleSubmit((values) => mutation.mutate(values));

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (mutation.isPending) return;
        if (o) {
          form.reset(toDefaults(employee));
          setPerson(null);
        }
        onOpenChange(o);
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-lg">{isEdit ? "Edit employee" : "Add employee"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? `Update details for ${employee.name}.`
              : "Pick someone from your Microsoft directory. They sign in with their work account."}
          </SheetDescription>
        </SheetHeader>

        <form id="employee-form" onSubmit={onSubmit} noValidate className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {isEdit ? (
            <FormField label="Work email" htmlFor="email" hint="Linked to their Microsoft account and can't be changed.">
              <div className="relative">
                <Input id="email" value={employee.email} readOnly disabled className="pr-9" />
                <Lock className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </FormField>
          ) : (
            <FormField
              label="Work email"
              htmlFor="email"
              error={errors.email?.message}
              hint={errors.email ? undefined : "Only people without a portal account are listed."}
              required
            >
              <DirectoryPersonPicker
                value={person}
                invalid={!!errors.email}
                onSelect={(selected) => {
                  setPerson(selected);
                  form.setValue("email", selected.email, { shouldValidate: true });
                  form.setValue("name", selected.name, { shouldValidate: !!form.formState.errors.name });
                  form.setValue("phone", selected.phone ?? "", { shouldValidate: !!form.formState.errors.phone });
                  form.setValue("designation", selected.jobTitle?.trim().slice(0, 80) ?? "", {
                    shouldValidate: !!form.formState.errors.designation,
                  });
                }}
              />
            </FormField>
          )}

          <FormField label="Full name" htmlFor="name" error={errors.name?.message} required>
            <Input id="name" placeholder="e.g. Hammad Khan" aria-invalid={!!errors.name} {...form.register("name")} />
          </FormField>

          <FormField label="Designation" htmlFor="designation" error={errors.designation?.message} hint="Filled from their Microsoft job title. You can change it.">
            <Input id="designation" placeholder="e.g. Consultant" aria-invalid={!!errors.designation} {...form.register("designation")} />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
              <Input id="phone" type="tel" placeholder="+91 98765 43210" aria-invalid={!!errors.phone} {...form.register("phone")} />
            </FormField>
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
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          </div>

          <Controller
            control={form.control}
            name="parkingEligible"
            render={({ field }) => (
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold">Parking enabled</span>
                  <span className="block text-xs text-muted-foreground">
                    Eligible employees are billed every month for each active vehicle.
                  </span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />

          <Controller
            control={form.control}
            name="freePass"
            render={({ field }) => (
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold">Free pass</span>
                  <span className="block text-xs text-muted-foreground">
                    Free pass holders are not billed. They still appear on the Clover Hills pass list.
                  </span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />
        </form>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
            {isEdit ? "Save changes" : "Add employee"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
