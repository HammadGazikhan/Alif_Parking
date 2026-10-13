"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, MoreHorizontal, Pencil, Power, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { EmployeeFormSheet, type EditableEmployee } from "@/components/employees/employee-form-sheet";
import { EmployeeStatusDialog } from "@/components/employees/employee-status-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { api, type Paginated } from "@/lib/api-client";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { Jsonify } from "@/lib/types";
import type { EmployeeListItem } from "@/server/services/employee.service";

type Row = Jsonify<EmployeeListItem>;

export function EmployeesTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [hasVehicle, setHasVehicle] = useState("all");
  const [parkingEligible, setParkingEligible] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditableEmployee | undefined>();
  const [statusTarget, setStatusTarget] = useState<Row | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const filters = { search: debouncedSearch, status, hasVehicle, parkingEligible, page, pageSize: DEFAULT_PAGE_SIZE };
  const query = useQuery({
    queryKey: ["employees", filters],
    queryFn: () => api<Paginated<Row>>("/api/employees", { query: filters }),
    placeholderData: keepPreviousData,
  });

  const updateFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };
  const filtered = !!debouncedSearch || [status, hasVehicle, parkingEligible].some((v) => v !== "all");

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (row: Row) => {
    setEditing(row);
    setFormOpen(true);
  };

  const actions = (row: Row) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => router.push(`/admin/employees/${row.id}`)}>
          <Eye /> View details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openEdit(row)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant={row.status === "ACTIVE" ? "destructive" : "default"}
          onSelect={() => setStatusTarget(row)}
        >
          <Power /> {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<Row>[] = [
    {
      key: "employee",
      header: "Employee",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <InitialsAvatar name={row.name} src={row.avatarType ? `/api/employees/${row.id}/avatar` : undefined} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{row.name}</p>
            {row.designation ? <p className="truncate text-xs text-muted-foreground">{row.designation}</p> : null}
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      cell: (row) => <span className="text-sm tabular">{row.phone ?? "—"}</span>,
    },
    {
      key: "vehicle",
      header: "Vehicle",
      cell: (row) =>
        row.vehicles.length ? (
          <div className="flex flex-wrap gap-1">
            {row.vehicles.map((v) => (
              <span key={v.id} className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold">
                {v.number}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        ),
    },
    {
      key: "parking",
      header: "Parking",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.parkingEligible ? (
            <StatusBadge label="Enabled" tone="gold" />
          ) : (
            <StatusBadge label="Disabled" tone="neutral" />
          )}
          {row.freePass ? <StatusBadge label="Free pass" tone="info" /> : null}
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "actions", header: <span className="sr-only">Actions</span>, cell: actions, className: "w-12 text-right" },
  ];

  return (
    <>
      <div className="surface-card overflow-hidden">
        <FilterBar>
          <SearchInput
            value={search}
            onChange={updateFilter(setSearch)}
            placeholder="Search name, email or vehicle"
            className="sm:max-w-sm"
          />
          <FilterSelect
            value={status}
            onChange={updateFilter(setStatus)}
            allLabel="All statuses"
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ]}
          />
          <FilterSelect
            value={hasVehicle}
            onChange={updateFilter(setHasVehicle)}
            allLabel="Any vehicle"
            options={[
              { value: "true", label: "Vehicle assigned" },
              { value: "false", label: "No vehicle" },
            ]}
          />
          <FilterSelect
            value={parkingEligible}
            onChange={updateFilter(setParkingEligible)}
            allLabel="Any parking"
            options={[
              { value: "true", label: "Parking enabled" },
              { value: "false", label: "Parking disabled" },
            ]}
          />
          <Button className="sm:ml-auto" onClick={openCreate}>
            <UserPlus /> Add employee
          </Button>
        </FilterBar>

        {query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={query.data?.items}
            loading={query.isFetching}
            getRowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/admin/employees/${r.id}`)}
            mobileCard={(row) => (
              <div className="flex items-start gap-3">
                <InitialsAvatar name={row.name} src={row.avatarType ? `/api/employees/${row.id}/avatar` : undefined} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{row.name}</p>
                    <StatusBadge status={row.status} />
                  </div>
                  {row.designation ? <p className="truncate text-xs text-muted-foreground">{row.designation}</p> : null}
                  <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                  <p className="mt-1.5 text-xs">
                    {row.vehicles.length ? (
                      <span className="font-mono font-semibold">{row.vehicles.map((v) => v.number).join(", ")}</span>
                    ) : (
                      <span className="text-muted-foreground">No vehicle</span>
                    )}
                  </p>
                </div>
                {actions(row)}
              </div>
            )}
            empty={
              <EmptyState
                icon={Users}
                title={filtered ? "No employees match your filters" : "No employees yet"}
                description={filtered ? "Try a different search or clear the filters." : "Add your first employee to get started."}
                action={
                  filtered ? undefined : (
                    <Button onClick={openCreate}>
                      <UserPlus /> Add employee
                    </Button>
                  )
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
            noun="employees"
          />
        ) : null}
      </div>

      <EmployeeFormSheet open={formOpen} onOpenChange={setFormOpen} employee={editing} key={editing?.id ?? "new"} />
      <EmployeeStatusDialog employee={statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)} />
    </>
  );
}
