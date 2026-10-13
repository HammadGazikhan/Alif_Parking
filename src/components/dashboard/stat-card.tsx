"use client";

import { useCountUp } from "@/hooks/use-count-up";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  format = "number",
  icon,
  hint,
  variant = "default",
  delay = 0,
}: {
  label: string;
  value: number;
  format?: "number" | "currency";
  /** Rendered element (e.g. `<Users />`) so the card can be used from Server Components. */
  icon: React.ReactNode;
  hint?: React.ReactNode;
  variant?: "default" | "ink";
  delay?: number;
}) {
  const animated = useCountUp(value);
  const display = format === "currency" ? formatINR(animated) : animated.toLocaleString("en-IN");
  const ink = variant === "ink";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5 animate-fade-up",
        ink ? "ink-surface border-white/10 shadow-lift" : "border-border bg-card shadow-soft hover:shadow-lift",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-xs font-semibold tracking-wide", ink ? "text-white/60" : "text-muted-foreground")}>
          {label}
        </p>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl transition-colors [&_svg]:size-4",
            ink ? "bg-gold text-ink" : "bg-muted text-foreground/70 group-hover:bg-gold-soft group-hover:text-gold-strong",
          )}
        >
          {icon}
        </span>
      </div>
      <p className={cn("mt-4 text-[28px] leading-none font-bold tracking-tight tabular", ink && "text-white")}>
        {display}
      </p>
      {hint ? (
        <div className={cn("mt-3 text-xs", ink ? "text-white/55" : "text-muted-foreground")}>{hint}</div>
      ) : null}
    </div>
  );
}
