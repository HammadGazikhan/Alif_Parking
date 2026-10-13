"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

export function EmployeeStatusDialog({
  employee,
  onOpenChange,
}: {
  employee: { id: string; name: string; status: "ACTIVE" | "INACTIVE" } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const deactivate = employee?.status === "ACTIVE";

  const mutation = useMutation({
    mutationFn: () =>
      api<{ feeCreatedFor: string | null }>(`/api/employees/${employee!.id}`, {
        method: "PATCH",
        body: { status: deactivate ? "INACTIVE" : "ACTIVE" },
      }),
    onSuccess: (result) => {
      toast.success(`${employee!.name} ${deactivate ? "deactivated" : "activated"}`, {
        description: result.feeCreatedFor ? `${result.feeCreatedFor} parking fee created` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (result.feeCreatedFor) queryClient.invalidateQueries({ queryKey: ["parking-fees"] });
      router.refresh();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <ConfirmDialog
      open={!!employee}
      onOpenChange={onOpenChange}
      title={deactivate ? `Deactivate ${employee?.name}?` : `Activate ${employee?.name}?`}
      description={
        deactivate
          ? "They will be signed out of the portal and excluded from future monthly fee generation. Existing fees and payment history are kept."
          : "They will be able to sign in again and will be included in future monthly fee generation."
      }
      confirmLabel={deactivate ? "Deactivate" : "Activate"}
      tone={deactivate ? "destructive" : "default"}
      loading={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    />
  );
}
