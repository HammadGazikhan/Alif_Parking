"use client";

import { useSyncExternalStore } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/money";

export type CollectionPoint = {
  shortLabel: string;
  label: string;
  collected: number;
  outstanding: number;
};

const config = {
  collected: { label: "Collected", color: "var(--chart-1)" },
  outstanding: { label: "Outstanding", color: "var(--chart-2)" },
} satisfies ChartConfig;

function compactINR(paise: number) {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(rupees >= 10000 ? 0 : 1)}k`;
  return `₹${rupees}`;
}

const noopSubscribe = () => () => {};

export function CollectionChart({ data, height = 260 }: { data: CollectionPoint[]; height?: number }) {
  // Recharts measures its container on the client; rendering it during SSR
  // leaves bars stuck at their initial (zero) height after hydration.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <Skeleton className="w-full rounded-xl" style={{ height }} />;

  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={4}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          fontSize={11}
          tickFormatter={(v: number) => compactINR(v)}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", radius: 8 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-6">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: `var(--color-${String(name)})` }}
                    />
                    {config[name as keyof typeof config]?.label ?? String(name)}
                  </span>
                  <span className="font-semibold text-foreground tabular">{formatINR(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="collected" stackId="a" fill="var(--color-collected)" radius={[0, 0, 6, 6]} maxBarSize={36} />
        <Bar dataKey="outstanding" stackId="a" fill="var(--color-outstanding)" radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ChartContainer>
  );
}
