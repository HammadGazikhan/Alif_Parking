"use client";

import { useMutation } from "@tanstack/react-query";
import { BellRing, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

export function RemindButton({ feeId, name, size = "xs" }: { feeId: string; name: string; size?: "xs" | "sm" }) {
  const mutation = useMutation({
    mutationFn: () => api(`/api/parking-fees/${feeId}/remind`, { method: "POST" }),
    onSuccess: () => toast.success(`Reminder sent to ${name}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Button
      variant="outline"
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        mutation.mutate();
      }}
      disabled={mutation.isPending || mutation.isSuccess}
    >
      {mutation.isPending ? <Loader2 className="animate-spin" /> : mutation.isSuccess ? <Check /> : <BellRing />}
      {mutation.isSuccess ? "Sent" : "Remind"}
    </Button>
  );
}
