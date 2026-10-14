"use client";

import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BarChart3, FileSpreadsheet, FileText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CollectionChart } from "@/components/dashboard/collection-chart";
import { FilterSelect } from "@/components/shared/filters";
import { SectionCard } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { api } from "@/lib/api-client";
import { formatBillingPeriod, formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { Jsonify } from "@/lib/types";
import type { FeeListItem } from "@/server/services/parking-fee.service";
import type { MonthlyCollectionRow } from "@/server/services/report.service";

type FeePeriod = { month: number; year: number };

type ReportResponse = {
  monthly: MonthlyCollectionRow[];
  totals: { expected: number; collected: number; outstanding: number };
  rows: Jsonify<FeeListItem>[];
  periods: FeePeriod[];
};

const NO_FEES = "No fees have been generated for that month.";

const toMonthValue = (p: FeePeriod) => `${p.year}-${String(p.month).padStart(2, "0")}`;

function defaultWindow(periods: FeePeriod[]) {
  const values = periods.map(toMonthValue);
  const latest = values.slice(-6);
  return { from: latest[0] ?? "", to: values.at(-1) ?? "", pass: values.at(-1) ?? "" };
}

export function ReportsView({ employees }: { employees: { id: string; name: string; email: string }[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [userId, setUserId] = useState("all");
  const [passMonth, setPassMonth] = useState("");
  const seeded = useRef(false);

  const filters = { from, to, status, userId };
  const query = useQuery({
    queryKey: ["reports", filters],
    queryFn: () =>
      api<ReportResponse>("/api/reports", {
        query: from && to ? filters : { status, userId },
      }),
    placeholderData: keepPreviousData,
  });

  const periods = query.data?.periods ?? [];

  useEffect(() => {
    if (!query.data || seeded.current) return;
    seeded.current = true;
    const next = defaultWindow(query.data.periods);
    setFrom(next.from);
    setTo(next.to);
    setPassMonth(next.pass);
  }, [query.data]);

  const exportHref = (format: "csv" | "xlsx") => {
    const params = new URLSearchParams({ format });
    for (const [k, v] of Object.entries(filters)) if (v && v !== "all") params.set(k, v);
    return `/api/reports/export?${params.toString()}`;
  };

  const resetFilters = () => {
    const next = defaultWindow(periods);
    setFrom(next.from);
    setTo(next.to);
    setStatus("all");
    setUserId("all");
  };

  const data = query.data;
  const periodOptions = periods.map((period) => ({
    value: toMonthValue(period),
    label: formatBillingPeriod(period.month, period.year),
  }));
  const knownMonths = new Set(periodOptions.map((option) => option.value));
  const canExport = knownMonths.has(from) && knownMonths.has(to) && from <= to;
  const canPass = knownMonths.has(passMonth);
  const noFees = data !== undefined && periods.length === 0;
  const rate = data?.totals.expected ? Math.round((data.totals.collected / data.totals.expected) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="surface-card flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="grid grid-cols-2 gap-3 lg:flex">
          <MonthField
            label="From"
            value={from}
            options={periodOptions.filter((option) => !to || option.value <= to)}
            onChange={(value) => {
              setFrom(value);
              if (to && value > to) setTo(value);
            }}
          />
          <MonthField
            label="To"
            value={to}
            options={periodOptions.filter((option) => !from || option.value >= from)}
            onChange={(value) => {
              setTo(value);
              if (from && value < from) setFrom(value);
            }}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex">
          <FilterSelect
            value={status}
            onChange={setStatus}
            allLabel="All statuses"
            options={[
              { value: "PAID", label: "Paid" },
              { value: "DUE", label: "Due" },
              { value: "OVERDUE", label: "Overdue" },
            ]}
          />
          <FilterSelect
            value={userId}
            onChange={setUserId}
            allLabel="All employees"
            className="sm:min-w-[180px]"
            options={employees.map((e) => ({ value: e.id, label: `${e.name} (${e.email})` }))}
          />
        </div>
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw /> Reset
          </Button>
          {canExport ? (
            <Button variant="outline" asChild>
              <a href={exportHref("csv")} download>
                <FileText /> CSV
              </a>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              <FileText /> CSV
            </Button>
          )}
          {canExport ? (
            <Button variant="ink" asChild>
              <a href={exportHref("xlsx")} download>
                <FileSpreadsheet /> Excel
              </a>
            </Button>
          ) : (
            <Button variant="ink" disabled>
              <FileSpreadsheet /> Excel
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-3 lg:w-full">
          <div className="flex flex-wrap items-end gap-2">
            <MonthField label="Pass list month" value={passMonth} options={periodOptions} onChange={setPassMonth} />
            {canPass ? (
              <Button variant="outline" asChild>
                <a
                  href={`/api/reports/pass-list?month=${Number(passMonth.slice(5))}&year=${Number(passMonth.slice(0, 4))}`}
                  download
                >
                  <FileSpreadsheet /> CHP pass list (Excel)
                </a>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <FileSpreadsheet /> CHP pass list (Excel)
              </Button>
            )}
          </div>
          {noFees ? <p className="text-sm text-muted-foreground">{NO_FEES}</p> : null}
        </div>
      </div>

      {query.isError ? (
        <div className="surface-card">
          <ErrorState onRetry={() => query.refetch()} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="Expected" value={data ? formatINR(data.totals.expected) : null} />
            <Metric label="Collected" value={data ? formatINR(data.totals.collected) : null} tone="success" />
            <Metric label="Outstanding" value={data ? formatINR(data.totals.outstanding) : null} tone="danger" />
            <Metric label="Collection rate" value={data ? `${rate}%` : null} tone="gold" />
          </div>

          <SectionCard
            title="Collection by month"
            description={
              from && to
                ? `${formatBillingPeriod(Number(from.slice(5)), Number(from.slice(0, 4)))} – ${formatBillingPeriod(Number(to.slice(5)), Number(to.slice(0, 4)))}`
                : undefined
            }
            contentClassName="px-3 pt-4 pb-3 sm:px-5"
          >
            {data ? <CollectionChart data={data.monthly} height={280} /> : <Skeleton className="h-[280px] w-full rounded-xl" />}
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <SectionCard title="Monthly summary">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      <th className="px-5 py-2.5">Month</th>
                      <th className="px-3 py-2.5 text-right">Expected</th>
                      <th className="px-3 py-2.5 text-right">Collected</th>
                      <th className="px-5 py-2.5 text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(data?.monthly ?? []).map((m) => (
                      <tr key={`${m.year}-${m.month}`}>
                        <td className="px-5 py-2.5 font-medium">{m.label}</td>
                        <td className="px-3 py-2.5 text-right tabular">{formatINR(m.expected)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular">{formatINR(m.collected)}</td>
                        <td className="px-5 py-2.5 text-right text-muted-foreground tabular">
                          {m.paidCount}/{m.feeCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard
              title="Fee details"
              description={data ? `${data.rows.length}${data.rows.length === 200 ? "+" : ""} fees · export for the full list` : undefined}
            >
              {data && data.rows.length === 0 ? (
                <EmptyState icon={BarChart3} title="No data for these filters" description="Try widening the date range." />
              ) : (
                <div className="max-h-[460px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="bg-muted/40 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                        <th className="px-5 py-2.5">Employee</th>
                        <th className="px-3 py-2.5">Month</th>
                        <th className="px-3 py-2.5 text-right">Amount</th>
                        <th className="px-3 py-2.5">Paid</th>
                        <th className="px-5 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(data?.rows ?? []).map((r) => (
                        <tr key={r.id}>
                          <td className="px-5 py-2.5">
                            <p className="font-medium">{r.user.name}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{r.vehicle.number}</p>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{formatBillingPeriod(r.month, r.year, true)}</td>
                          <td className="px-3 py-2.5 text-right tabular">{formatINR(r.amount)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(r.paidAt)}</td>
                          <td className="px-5 py-2.5">
                            <StatusBadge status={r.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

function MonthField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const disabled = options.length === 0 || !options.some((option) => option.value === value);
  return (
    <div className="flex min-w-[12.5rem] flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      <Select key={value || "empty"} value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full min-w-[12.5rem]" aria-label={label}>
          <SelectValue placeholder={options.length === 0 ? "No months" : label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | null; tone?: "success" | "danger" | "gold" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "gold" ? "text-gold-strong" : "";
  return (
    <div className="surface-card p-4 sm:p-5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      {value === null ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className={`mt-2 text-xl font-bold tracking-tight tabular sm:text-2xl ${toneClass}`}>{value}</p>
      )}
    </div>
  );
}
