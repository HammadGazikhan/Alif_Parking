"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Layers, Loader2, Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { applyFieldErrors } from "@/lib/form-errors";
import { formatINR, paiseToRupees } from "@/lib/money";
import { categorySchema, type CategoryInput } from "@/lib/validations/parking";

export type CategoryRow = {
  id: string;
  name: string;
  monthlyFee: number;
  active: boolean;
  activeVehicleCount: number;
};

export function CategoriesCard({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<CategoryRow | null>(null);

  const toggle = useMutation({
    mutationFn: (category: CategoryRow) =>
      api(`/api/settings/categories/${category.id}`, {
        method: "PATCH",
        body: {
          name: category.name,
          monthlyFee: paiseToRupees(category.monthlyFee),
          active: !category.active,
        },
      }),
    onSuccess: (_r, category) => {
      toast.success(category.active ? `${category.name} deactivated` : `${category.name} activated`);
      setToggling(null);
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <SectionCard
      title="Vehicle categories"
      description="Each category has one monthly parking fee. Bills use the fee in effect when they are created."
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> Add category
        </Button>
      }
    >
      {categories.length ? (
        <ul className="divide-y divide-border">
          {categories.map((category) => (
            <li key={category.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{category.name}</p>
                  {category.active ? (
                    <StatusBadge label="Active" tone="success" />
                  ) : (
                    <StatusBadge label="Inactive" tone="neutral" />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {category.activeVehicleCount} active vehicle{category.activeVehicleCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="mr-2 text-base font-bold tabular">
                  {formatINR(category.monthlyFee)}
                  <span className="text-xs font-medium text-muted-foreground">/mo</span>
                </p>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${category.name}`} onClick={() => setEditing(category)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={category.active ? `Deactivate ${category.name}` : `Activate ${category.name}`}
                  onClick={() => setToggling(category)}
                >
                  <Power className={category.active ? "text-danger" : "text-success"} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Layers} title="No vehicle categories" description="Add a category before registering vehicles." />
      )}

      {creating || editing ? (
        <CategoryDialog
          category={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && !toggle.isPending && setToggling(null)}
        title={toggling?.active ? `Deactivate ${toggling.name}?` : `Activate ${toggling?.name}?`}
        description={
          toggling?.active
            ? "Active vehicles in this category must be moved first. Existing bills are not changed."
            : "New vehicles can be assigned to this category again. Existing bills are not changed."
        }
        confirmLabel={toggling?.active ? "Deactivate" : "Activate"}
        tone={toggling?.active ? "destructive" : "default"}
        loading={toggle.isPending}
        onConfirm={() => toggling && toggle.mutate(toggling)}
      />
    </SectionCard>
  );
}

function CategoryDialog({ category, onClose }: { category?: CategoryRow; onClose: () => void }) {
  const router = useRouter();
  const form = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? "",
      monthlyFee: category ? paiseToRupees(category.monthlyFee) : 0,
      active: category?.active ?? true,
    },
  });
  const { errors } = form.formState;

  const mutation = useMutation({
    mutationFn: (values: CategoryInput) =>
      category
        ? api(`/api/settings/categories/${category.id}`, { method: "PATCH", body: values })
        : api("/api/settings/categories", { method: "POST", body: values }),
    onSuccess: () => {
      toast.success(category ? "Category updated" : "Category created");
      router.refresh();
      onClose();
    },
    onError: (e) => {
      applyFieldErrors(e, form.setError);
      toast.error(errorMessage(e));
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{category ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>The monthly fee applies to bills created after you save. Existing bills stay as they are.</DialogDescription>
        </DialogHeader>
        <form id="category-form" noValidate onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <FormField label="Category name" htmlFor="category-name" error={errors.name?.message} required>
            <Input id="category-name" placeholder="e.g. Car" {...form.register("name")} />
          </FormField>
          <FormField label="Monthly parking fee (₹)" htmlFor="category-fee" error={errors.monthlyFee?.message} required>
            <Input
              id="category-fee"
              type="number"
              min={0}
              className="tabular"
              {...form.register("monthlyFee", { valueAsNumber: true })}
            />
          </FormField>
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold">Active</span>
                  <span className="block text-xs text-muted-foreground">Inactive categories cannot be assigned to active vehicles.</span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
            {category ? "Save category" : "Create category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
