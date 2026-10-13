"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CreditCard, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, TablePagination, type Column } from "@/components/shared/data-table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { StatusBadge } from "@/components/shared/status-badge";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { useDebounce } from "@/hooks/use-debounce";
import { api, type Paginated } from "@/lib/api-client";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { currentPeriod, formatBillingPeriod, formatDateTime, shiftPeriod } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { Jsonify } from "@/lib/types";
import type { listPayments } from "@/server/services/payment.service";

type Row = Jsonify<Awaited<ReturnType<typeof listPayments>>["items"][number]>;

export function PaymentsTable() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const periodOptions = useMemo(() => {
    const now = currentPeriod();
    return Array.from({ length: 12 }, (_, i) => {
      const p = shiftPeriod(now, -i);
      return { value: `${p.year}-${p.month}`, label: formatBillingPeriod(p.month, p.year) };
    });
  }, []);
  const [year, month] = period === "all" ? [undefined, undefined] : period.split("-").map(Number);

  const filters = { search: debouncedSearch, status, month, year, page, pageSize: DEFAULT_PAGE_SIZE };
  const query = useQuery({
    queryKey: ["payments", filters],
    queryFn: () => api<Paginated<Row>>("/api/payments", { query: filters }),
    placeholderData: keepPreviousData,
  });

  const reset = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const columns: Column<Row>[] = [
    {
      key: "employee",
      header: "Employee",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <InitialsAvatar name={row.parkingFee.user.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{row.parkingFee.user.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{row.parkingFee.user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "fee",
      header: "Fee",
      cell: (row) => (
        <div>
          <p className="text-sm">{formatBillingPeriod(row.parkingFee.month, row.parkingFee.year, true)}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{row.parkingFee.vehicle.number}</p>
        </div>
      ),
    },
    { key: "amount", header: "Amount", cell: (row) => <span className="text-sm font-semibold tabular">{formatINR(row.amount)}</span> },
    {
      key: "txn",
      header: "Transaction",
      cell: (row) => (
        <div className="max-w-[200px]">
          <p className="truncate font-mono text-[11px]">{row.paymentId ?? "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {row.provider === "MOCK" ? "Mock gateway" : "Razorpay"}
            {row.paymentMethod ? ` · ${row.paymentMethod.toUpperCase()}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      cell: (row) => (
        <div>
          <p className="text-sm">{formatDateTime(row.paidAt ?? row.createdAt)}</p>
          {row.failureReason ? <p className="max-w-[220px] truncate text-[11px] text-danger">{row.failureReason}</p> : null}
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "receipt",
      header: <span className="sr-only">Receipt</span>,
      className: "w-24 text-right",
      cell: (row) =>
        row.status === "SUCCESS" ? (
          <Button variant="ghost" size="xs" asChild>
            <Link href={`/admin/payments/${row.id}/receipt`}>
              <ReceiptText /> Receipt
            </Link>
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="surface-card overflow-hidden">
      <FilterBar>
        <SearchInput
          value={search}
          onChange={reset(setSearch)}
          placeholder="Search transaction, employee or vehicle"
          className="sm:max-w-sm"
        />
        <FilterSelect
          value={status}
          onChange={reset(setStatus)}
          allLabel="All statuses"
          options={[
            { value: "SUCCESS", label: "Success" },
            { value: "PENDING", label: "Pending" },
            { value: "FAILED", label: "Failed" },
            { value: "REFUNDED", label: "Refunded" },
          ]}
        />
        <FilterSelect value={period} onChange={reset(setPeriod)} allLabel="All periods" options={periodOptions} />
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
              <InitialsAvatar name={row.parkingFee.user.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{row.parkingFee.user.name}</p>
                  <p className="text-sm font-semibold tabular">{formatINR(row.amount)}</p>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">
                    {formatBillingPeriod(row.parkingFee.month, row.parkingFee.year, true)} · {formatDateTime(row.paidAt ?? row.createdAt)}
                  </p>
                  <StatusBadge status={row.status} />
                </div>
                {row.status === "SUCCESS" ? (
                  <Link href={`/admin/payments/${row.id}/receipt`} className="mt-1 inline-block text-xs font-semibold text-gold-strong">
                    View receipt
                  </Link>
                ) : null}
              </div>
            </div>
          )}
          empty={<EmptyState icon={CreditCard} title="No payments found" description="Payments appear here once employees start paying." />}
        />
      )}
      {query.data ? (
        <TablePagination
          page={query.data.page}
          pageCount={query.data.pageCount}
          total={query.data.total}
          pageSize={query.data.pageSize}
          onPageChange={setPage}
          noun="payments"
        />
      ) : null}
    </div>
  );
}
