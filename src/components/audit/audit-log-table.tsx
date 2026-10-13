"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { DataTable, TablePagination, type Column } from "@/components/shared/data-table";
import { FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { StatusBadge } from "@/components/shared/status-badge";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { useDebounce } from "@/hooks/use-debounce";
import { api, type Paginated } from "@/lib/api-client";
import { formatDateTime } from "@/lib/dates";

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
};

type Tone = "success" | "warning" | "danger" | "neutral" | "info" | "gold";

const ACTIONS: Record<string, { label: string; tone: Tone }> = {
  EMPLOYEE_CREATED: { label: "Employee created", tone: "success" },
  EMPLOYEE_UPDATED: { label: "Employee updated", tone: "info" },
  EMPLOYEE_ACTIVATED: { label: "Employee activated", tone: "success" },
  EMPLOYEE_DEACTIVATED: { label: "Employee deactivated", tone: "danger" },
  VEHICLE_CREATED: { label: "Vehicle added", tone: "success" },
  VEHICLE_UPDATED: { label: "Vehicle updated", tone: "info" },
  VEHICLE_DELETED: { label: "Vehicle deleted", tone: "danger" },
  FEES_GENERATED: { label: "Fees generated", tone: "gold" },
  FEE_UPDATED: { label: "Fee updated", tone: "info" },
  FEE_CANCELLED: { label: "Fee cancelled", tone: "danger" },
  FEES_MARKED_OVERDUE: { label: "Marked overdue", tone: "warning" },
  PAYMENT_STATUS_CHANGED: { label: "Payment status", tone: "success" },
  SETTINGS_UPDATED: { label: "Settings updated", tone: "gold" },
  FEE_RULE_CREATED: { label: "Fee rule created", tone: "gold" },
  FEE_RULE_UPDATED: { label: "Fee rule updated", tone: "gold" },
  FEE_RULE_DELETED: { label: "Fee rule deleted", tone: "danger" },
  CATEGORY_CREATED: { label: "Category created", tone: "success" },
  CATEGORY_UPDATED: { label: "Category updated", tone: "info" },
  CATEGORY_ACTIVATED: { label: "Category activated", tone: "success" },
  CATEGORY_DEACTIVATED: { label: "Category deactivated", tone: "danger" },
  REMINDER_SENT: { label: "Reminder sent", tone: "neutral" },
};

export function AuditLogTable() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const filters = { search: debouncedSearch, action, page, pageSize: 20 };
  const query = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => api<Paginated<AuditRow>>("/api/audit-logs", { query: filters }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AuditRow>[] = [
    {
      key: "when",
      header: "When",
      className: "whitespace-nowrap",
      cell: (row) => <span className="text-xs text-muted-foreground tabular">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: "actor",
      header: "Actor",
      cell: (row) =>
        row.actor ? (
          <div className="flex items-center gap-2">
            <InitialsAvatar name={row.actor.name} size="sm" />
            <span className="text-sm font-medium">{row.actor.name}</span>
          </div>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">System</span>
        ),
    },
    {
      key: "action",
      header: "Action",
      cell: (row) => <StatusBadge label={ACTIONS[row.action]?.label ?? row.action} tone={ACTIONS[row.action]?.tone ?? "neutral"} />,
    },
    {
      key: "description",
      header: "Description",
      cell: (row) => (
        <div className="max-w-[460px]">
          <p className="text-sm">{row.description}</p>
          {row.metadata && Object.keys(row.metadata as object).length ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
                Details
              </summary>
              <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-muted p-2 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(row.metadata, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ),
    },
    {
      key: "entity",
      header: "Entity",
      cell: (row) => (
        <div>
          <p className="text-xs font-medium">{row.entityType}</p>
          {row.entityId ? <p className="max-w-[160px] truncate font-mono text-[11px] text-muted-foreground">{row.entityId}</p> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="surface-card overflow-hidden">
      <FilterBar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search description, actor or entity"
          className="sm:max-w-sm"
        />
        <FilterSelect
          value={action}
          onChange={(v) => {
            setAction(v);
            setPage(1);
          }}
          allLabel="All actions"
          className="sm:min-w-[200px]"
          options={Object.entries(ACTIONS).map(([value, a]) => ({ value, label: a.label }))}
        />
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge label={ACTIONS[row.action]?.label ?? row.action} tone={ACTIONS[row.action]?.tone ?? "neutral"} />
                <span className="text-[11px] text-muted-foreground tabular">{formatDateTime(row.createdAt)}</span>
              </div>
              <p className="text-sm">{row.description}</p>
              <p className="text-xs text-muted-foreground">{row.actor?.name ?? "System"}</p>
            </div>
          )}
          empty={<EmptyState icon={ScrollText} title="No audit entries" description="Administrative actions will be recorded here." />}
        />
      )}
      {query.data ? (
        <TablePagination
          page={query.data.page}
          pageCount={query.data.pageCount}
          total={query.data.total}
          pageSize={query.data.pageSize}
          onPageChange={setPage}
          noun="entries"
        />
      ) : null}
    </div>
  );
}
