"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatINR } from "@/lib/money";

type Breakdown = Record<"PAID" | "DUE" | "OVERDUE" | "CANCELLED", { count: number; amount: number }>;

const config = {
  PAID: { label: "Paid", color: "var(--success)" },
  DUE: { label: "Due", color: "var(--gold)" },
  OVERDUE: { label: "Overdue", color: "var(--danger)" },
} satisfies ChartConfig;

export function StatusDonut({ breakdown }: { breakdown: Breakdown }) {
  const keys = ["PAID", "DUE", "OVERDUE"] as const;
  const data = keys.map((k) => ({ status: k, count: breakdown[k].count, amount: breakdown[k].amount }));
  const total = data.reduce((s, d) => s + d.count, 0);
  const paidPct = total ? Math.round((breakdown.PAID.count / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative size-44 shrink-0">
        <ChartContainer config={config} className="size-44">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="status"
                  hideLabel
                  formatter={(value, _name, item) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {config[item.payload.status as keyof typeof config].label}
                      </span>
                      <span className="font-semibold tabular">{String(value)} fees</span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={total ? data : [{ status: "EMPTY", count: 1, amount: 0 }]}
              dataKey="count"
              nameKey="status"
              innerRadius={58}
              outerRadius={80}
              paddingAngle={total ? 3 : 0}
              strokeWidth={0}
              cornerRadius={6}
            >
              {(total ? data : [{ status: "EMPTY" }]).map((d) => (
                <Cell
                  key={d.status}
                  fill={d.status === "EMPTY" ? "var(--muted)" : `var(--color-${d.status})`}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tracking-tight tabular">{paidPct}%</span>
          <span className="text-[11px] font-medium text-muted-foreground">paid</span>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {data.map((d) => (
          <li key={d.status} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
            <span className="flex items-center gap-2.5 text-sm font-medium">
              <span className="size-2.5 rounded-full" style={{ background: config[d.status].color }} />
              {config[d.status].label}
            </span>
            <span className="text-right">
              <span className="block text-sm font-semibold tabular">{d.count}</span>
              <span className="block text-[11px] text-muted-foreground tabular">{formatINR(d.amount)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
