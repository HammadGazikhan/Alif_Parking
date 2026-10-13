import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "neutral" | "info" | "gold";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-soft text-success ring-success/15",
  warning: "bg-warning-soft text-warning ring-warning/15",
  danger: "bg-danger-soft text-danger ring-danger/15",
  neutral: "bg-neutral-soft text-muted-foreground ring-foreground/8",
  info: "bg-info-soft text-info ring-info/15",
  gold: "bg-gold-soft text-gold-strong ring-gold/30",
};

const dotClasses: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted-foreground/60",
  info: "bg-info",
  gold: "bg-gold",
};

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // Parking fee
  PAID: { label: "Paid", tone: "success" },
  DUE: { label: "Due", tone: "warning" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  // Payment
  SUCCESS: { label: "Success", tone: "success" },
  PENDING: { label: "Pending", tone: "info" },
  CREATED: { label: "Created", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  // User / vehicle
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
};

export function StatusBadge({
  status,
  label,
  tone,
  className,
  size = "default",
}: {
  status?: string;
  label?: string;
  tone?: Tone;
  className?: string;
  size?: "default" | "lg";
}) {
  const mapped = status ? STATUS_MAP[status] : undefined;
  const resolvedTone = tone ?? mapped?.tone ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ring-1 ring-inset",
        size === "lg" ? "px-3 py-1 text-xs tracking-wide" : "px-2.5 py-0.5 text-[11px]",
        toneClasses[resolvedTone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dotClasses[resolvedTone])} aria-hidden />
      {label ?? mapped?.label ?? status}
    </span>
  );
}
