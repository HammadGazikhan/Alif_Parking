"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading,
  empty,
  mobileCard,
  onRowClick,
  skeletonRows = 6,
  className,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowKey: (row: T) => string;
  loading?: boolean;
  empty?: React.ReactNode;
  mobileCard?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  skeletonRows?: number;
  className?: string;
}) {
  const showSkeleton = loading && !rows?.length;
  const isEmpty = !loading && rows !== undefined && rows.length === 0;

  return (
    <div className={cn("relative", className)}>
      <div className={cn(mobileCard ? "hidden md:block" : "block", "overflow-x-auto")}>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "h-11 bg-muted/40 px-4 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase first:pl-6 last:pr-6",
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <TableRow key={`s-${i}`} className="hover:bg-transparent">
                    {columns.map((col) => (
                      <TableCell key={col.key} className="px-4 py-4 first:pl-6 last:pr-6">
                        <Skeleton className="h-4 w-full max-w-[140px] rounded-md" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows?.map((row) => (
                  <TableRow
                    key={getRowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-border/70 transition-colors",
                      onRowClick && "cursor-pointer",
                      loading && "opacity-60",
                    )}
                  >
                    {columns.map((col) => (
                      <TableCell key={col.key} className={cn("px-4 py-3.5 first:pl-6 last:pr-6", col.className)}>
                        {col.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {mobileCard ? (
        <div className="divide-y divide-border md:hidden">
          {showSkeleton
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))
            : rows?.map((row) => (
                <div
                  key={getRowKey(row)}
                  className={cn("p-4", onRowClick && "cursor-pointer active:bg-muted/50", loading && "opacity-60")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {mobileCard(row)}
                </div>
              ))}
        </div>
      ) : null}

      {isEmpty ? empty : null}
    </div>
  );
}

export function TablePagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  noun = "results",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  noun?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-muted-foreground">
        Showing <span className="font-semibold text-foreground tabular">{from}</span>–
        <span className="font-semibold text-foreground tabular">{to}</span> of{" "}
        <span className="font-semibold text-foreground tabular">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft /> Prev
        </Button>
        <span className="min-w-16 text-center text-xs font-medium text-muted-foreground tabular">
          {page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
