"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bell, CheckCheck, CircleCheck, Clock, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const iconFor = (type: string) => {
  switch (type) {
    case "PAYMENT_SUCCESS":
      return <CircleCheck className="size-4 text-success" />;
    case "PAYMENT_OVERDUE":
    case "PAYMENT_FAILED":
      return <AlertCircle className="size-4 text-danger" />;
    case "PAYMENT_DUE":
      return <Clock className="size-4 text-warning" />;
    default:
      return <Info className="size-4 text-info" />;
  }
};

export function NotificationBell() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: NotificationItem[]; unread: number }>("/api/notifications"),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api("/api/notifications", { method: "PATCH", body: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = data?.unread ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Bell />
          {unread > 0 ? (
            <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-gold text-[9px] font-bold text-ink ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] rounded-2xl p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-[11px] text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up"}</p>
          </div>
          {unread > 0 ? (
            <Button variant="ghost" size="xs" onClick={() => markRead.mutate(undefined)} disabled={markRead.isPending}>
              <CheckCheck /> Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((n) => {
                const content = (
                  <div className={cn("flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60", !n.readAt && "bg-gold-soft/40")}>
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-card ring-1 ring-border">
                      {iconFor(n.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[13px] font-semibold">
                        {n.title}
                        {!n.readAt ? <span className="size-1.5 rounded-full bg-gold" aria-label="Unread" /> : null}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.body}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/80">{formatDateTime(n.createdAt)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id} onClick={() => !n.readAt && markRead.mutate([n.id])}>
                    {n.link ? <Link href={n.link}>{content}</Link> : content}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
