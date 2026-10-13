"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Car, CarFront, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { VehicleFormSheet, type CategoryOption, type EditableVehicle, type EmployeeOption } from "@/components/vehicles/vehicle-form-sheet";
import { useDebounce } from "@/hooks/use-debounce";
import { api, type Paginated } from "@/lib/api-client";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { errorMessage } from "@/lib/error-message";
import type { Jsonify } from "@/lib/types";
import type { VehicleListItem } from "@/server/services/vehicle.service";

type Row = Jsonify<VehicleListItem>;

export function VehicleTypeIcon({ type, className }: { type: string; className?: string }) {
  const name = type.trim().toLowerCase();
  const Icon = name === "car" ? CarFront : name === "bike" || name === "scooter" ? Bike : Car;
  return <Icon className={className} />;
}

export function VehiclesTable({ employees, categories }: { employees: EmployeeOption[]; categories: CategoryOption[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditableVehicle | undefined>();
  const [deleting, setDeleting] = useState<Row | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const filters = { search: debouncedSearch, categoryId, status, page, pageSize: DEFAULT_PAGE_SIZE };
  const query = useQuery({
    queryKey: ["vehicles", filters],
    queryFn: () => api<Paginated<Row>>("/api/vehicles", { query: filters }),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/vehicles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`Vehicle ${deleting?.number} deleted`);
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      router.refresh();
      setDeleting(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const updateFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };
  const filtered = !!debouncedSearch || categoryId !== "all" || status !== "all";

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
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.number}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={() => openEdit(row)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<Row>[] = [
    {
      key: "number",
      header: "Vehicle",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground/70">
            <VehicleTypeIcon type={row.category.name} className="size-4" />
          </span>
          <p className="font-mono text-sm font-bold tracking-wide">{row.number}</p>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Employee",
      cell: (row) => (
        <Link href={`/admin/employees/${row.user.id}`} className="group">
          <p className="text-sm font-medium group-hover:underline">{row.user.name}</p>
          <p className="text-xs text-muted-foreground">{row.user.email}</p>
        </Link>
      ),
    },
    { key: "category", header: "Category", cell: (row) => <span className="text-sm">{row.category.name}</span> },
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
            placeholder="Search number or employee"
            className="sm:max-w-sm"
          />
          <FilterSelect
            value={categoryId}
            onChange={updateFilter(setCategoryId)}
            allLabel="All categories"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
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
          <Button className="sm:ml-auto" onClick={openCreate}>
            <Plus /> Add vehicle
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
            mobileCard={(row) => (
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <VehicleTypeIcon type={row.category.name} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono font-bold tracking-wide">{row.number}</p>
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.user.name} · {row.category.name}
                  </p>
                </div>
                {actions(row)}
              </div>
            )}
            empty={
              <EmptyState
                icon={CarFront}
                title={filtered ? "No vehicles match your filters" : "No vehicles registered"}
                description={filtered ? "Try a different search or clear the filters." : "Register an employee's vehicle to start billing."}
                action={
                  filtered ? undefined : (
                    <Button onClick={openCreate}>
                      <Plus /> Add vehicle
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
            noun="vehicles"
          />
        ) : null}
      </div>

      <VehicleFormSheet
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        vehicle={editing}
        employees={employees}
        categories={categories}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete vehicle ${deleting?.number}?`}
        description="Vehicles with fee history can't be deleted — mark them inactive instead to stop future billing."
        confirmLabel="Delete vehicle"
        tone="destructive"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
