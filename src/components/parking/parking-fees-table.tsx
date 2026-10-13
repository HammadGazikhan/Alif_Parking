"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Ban, MoreHorizontal, ReceiptText, RotateCcw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, TablePagination, type Column } from "@/components/shared/data-table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { StatusBadge } from "@/components/shared/status-badge";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { api, type Paginated } from "@/lib/api-client";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { currentPeriod, daysOverdue, formatBillingPeriod, formatDate, shiftPeriod } from "@/lib/dates";
import { errorMessage } from "@/lib/error-message";
import { formatINR } from "@/lib/money";
import type { Jsonify } from "@/lib/types";
import type { FeeListItem } from "@/server/services/parking-fee.service";

type Row = Jsonify<FeeListItem>;
type Counts = Record<"ALL" | "DUE" | "PAID" | "OVERDUE" | "CANCELLED", number>;
type FeeStatusTab = "all" | "PAID" | "DUE" | "OVERDUE" | "CANCELLED";

const TABS: { value: FeeStatusTab; label: string; count: keyof Counts }[] = [
  { value: "all", label: "All", count: "ALL" },
  { value: "PAID", label: "Paid", count: "PAID" },
  { value: "DUE", label: "Due", count: "DUE" },
  { value: "OVERDUE", label: "Overdue", count: "OVERDUE" },
  { value: "CANCELLED", label: "Cancelled", count: "CANCELLED" },
];

export function ParkingFeesTable({ initialStatus }: { initialStatus?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FeeStatusTab>(
    TABS.some((t) => t.value === initialStatus) ? (initialStatus as FeeStatusTab) : "all",
  );
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const periodOptions = useMemo(() => {
    const now = currentPeriod();
    return Array.from({ length: 12 }, (_, i) => {
      const p = shiftPeriod(now, 1 - i);
      return { value: `${p.year}-${p.month}`, label: formatBillingPeriod(p.month, p.year) };
    });
  }, []);
  const [year, month] = period === "all" ? [undefined, undefined] : period.split("-").map(Number);

  const filters = { status, search: debouncedSearch, month, year, page, pageSize: DEFAULT_PAGE_SIZE };
  const query = useQuery({
    queryKey: ["parking-fees", filters],
    queryFn: () => api<Paginated<Row> & { counts: Counts }>("/api/parking-fees", { query: filters }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["parking-fees"] });
    router.refresh();
  };

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/api/parking-fees/${id}`, { method: "PATCH", body }),
    onSuccess: (_r, vars) => {
      toast.success(vars.body.action === "cancel" ? "Fee cancelled" : "Fee reopened");
      setCancelTarget(null);
      setReason("");
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remind = useMutation({
    mutationFn: (row: Row) => api(`/api/parking-fees/${row.id}/remind`, { method: "POST" }),
    onSuccess: (_r, row) => toast.success(`Reminder sent to ${row.user.name}`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const actions = (row: Row) => {
    const unpaid = row.status === "DUE" || row.status === "OVERDUE";
    const receipt = row.payments[0];
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Fee actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {receipt ? (
            <DropdownMenuItem asChild>
              <Link href={`/admin/payments/${receipt.id}/receipt`}>
                <ReceiptText /> View receipt
              </Link>
            </DropdownMenuItem>
          ) : null}
          {unpaid ? (
            <>
              <DropdownMenuItem onSelect={() => remind.mutate(row)}>
                <BellRing /> Send reminder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setCancelTarget(row)}>
                <Ban /> Cancel fee
              </DropdownMenuItem>
            </>
          ) : null}
          {row.status === "CANCELLED" ? (
            <DropdownMenuItem onSelect={() => update.mutate({ id: row.id, body: { action: "reopen" } })}>
              <RotateCcw /> Reopen fee
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const columns: Column<Row>[] = [
    {
      key: "employee",
      header: "Employee",
      cell: (row) => (
        <Link href={`/admin/employees/${row.user.id}`} className="group flex items-center gap-3">
          <InitialsAvatar name={row.user.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold group-hover:underline">{row.user.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{row.user.email}</p>
          </div>
        </Link>
      ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-semibold">{row.vehicle.number}</p>
          <p className="text-[11px] text-muted-foreground">{row.vehicle.category.name}</p>
        </div>
      ),
    },
    { key: "period", header: "Period", cell: (row) => <span className="text-sm">{formatBillingPeriod(row.month, row.year, true)}</span> },
    {
      key: "amount",
      header: "Amount",
      cell: (row) => (
        <div>
          <p className="text-sm font-semibold tabular">{formatINR(row.amount)}</p>
          {row.lateFee ? <p className="text-[11px] text-danger tabular">incl. {formatINR(row.lateFee)} late fee</p> : null}
        </div>
      ),
    },
    {
      key: "due",
      header: "Due / Paid",
      cell: (row) =>
        row.paidAt ? (
          <span className="text-sm">Paid {formatDate(row.paidAt)}</span>
        ) : (
          <div>
            <p className="text-sm">{formatDate(row.dueDate)}</p>
            {row.status === "OVERDUE" ? (
              <p className="text-[11px] font-semibold text-danger">{daysOverdue(new Date(row.dueDate))} days overdue</p>
            ) : null}
          </div>
        ),
    },
    {
      key: "txn",
      header: "Transaction",
      cell: (row) =>
        row.payments[0]?.paymentId ? (
          <span className="font-mono text-[11px] text-muted-foreground">{row.payments[0].paymentId}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "actions", header: <span className="sr-only">Actions</span>, cell: actions, className: "w-12 text-right" },
  ];

  const counts = query.data?.counts;

  return (
    <>
      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto border-b border-border px-4 pt-4 sm:px-6">
          <Tabs value={status} onValueChange={(v) => resetPage(setStatus)(v as FeeStatusTab)}>
            <TabsList variant="line" className="h-auto! gap-5 p-0">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="flex-none gap-2 px-0 pt-1 pb-3 font-semibold after:h-[3px]! after:rounded-full after:bg-gold group-data-horizontal/tabs:after:bottom-0"
                >
                  {t.label}
                  <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tabular text-muted-foreground">
                    {counts ? counts[t.count] : "–"}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <FilterBar>
          <SearchInput
            value={search}
            onChange={resetPage(setSearch)}
            placeholder="Search employee, ID or vehicle"
            className="sm:max-w-sm"
          />
          <FilterSelect value={period} onChange={resetPage(setPeriod)} allLabel="All periods" options={periodOptions} />
        </FilterBar>

        {query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={query.data?.items}
            loading={query.isFetching}
            getRowKey={(r) => r.id}
            mobileCard={(row) => (
              <div className="flex items-start gap-3">
                <InitialsAvatar name={row.user.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{row.user.name}</p>
                    <p className="text-sm font-semibold tabular">{formatINR(row.amount)}</p>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {formatBillingPeriod(row.month, row.year, true)} · <span className="font-mono">{row.vehicle.number}</span>
                    </p>
                    <StatusBadge status={row.status} />
                  </div>
                </div>
                {actions(row)}
              </div>
            )}
            empty={
              <EmptyState
                icon={Wallet}
                title="No parking fees found"
                description={
                  status === "all" && !debouncedSearch && period === "all"
                    ? "Generate monthly fees to start collecting parking payments."
                    : "Try another tab, period or search term."
                }
              />
            }
          />
        )}
        {query.data ? (
          <TablePagination
            page={query.data.page}
            pageCount={query.data.pageCount}
            total={query.data.total}
            pageSize={query.data.pageSize}
            onPageChange={setPage}
            noun="fees"
          />
        ) : null}
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCancelTarget(null);
            setReason("");
          }
        }}
        title="Cancel this parking fee?"
        description={
          cancelTarget
            ? `${cancelTarget.user.name} · ${formatBillingPeriod(cancelTarget.month, cancelTarget.year)} · ${formatINR(cancelTarget.amount)}. Any open payment QR for this fee will be invalidated.`
            : undefined
        }
        confirmLabel="Cancel fee"
        tone="destructive"
        loading={update.isPending}
        onConfirm={() =>
          cancelTarget &&
          update.mutate({ id: cancelTarget.id, body: { action: "cancel", reason: reason.trim() || undefined } })
        }
      >
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional), e.g. on leave this month"
          maxLength={200}
          rows={3}
        />
      </ConfirmDialog>
    </>
  );
}
