"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { breadcrumbsFor } from "./nav";
import { SidebarContent, type ShellUser } from "./sidebar";
import { CommandMenu } from "./command-menu";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

export function Header({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const crumbs = breadcrumbsFor(pathname);
  const visible = crumbs.slice(1);
  const current = visible.at(-1)?.label ?? "Dashboard";

  const parents = visible.slice(0, -1);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background no-print">
      <div className="relative flex h-14 items-center gap-3 px-4 sm:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <SheetContent side="left" className="w-[280px] border-none p-0" showCloseButton={false}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent user={user} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="min-w-0">
          {parents.length > 0 ? (
            <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
              {parents.map((c, i) => (
                <span key={c.href} className="flex items-center gap-1">
                  {i > 0 ? <ChevronRight className="size-3 opacity-60" /> : null}
                  <Link href={c.href} className="transition-colors hover:text-foreground">
                    {c.label}
                  </Link>
                </span>
              ))}
            </nav>
          ) : null}
          <h1 className="truncate text-sm font-semibold tracking-tight">{current}</h1>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <CommandMenu role={user.role} />
          <NotificationBell />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
