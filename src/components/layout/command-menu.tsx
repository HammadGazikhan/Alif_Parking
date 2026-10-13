"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, UserRound } from "lucide-react";
import type { Role } from "@/generated/prisma/browser";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebounce } from "@/hooks/use-debounce";
import { api, type Paginated } from "@/lib/api-client";
import { ADMIN_NAV, EMPLOYEE_NAV } from "./nav";

type EmployeeHit = { id: string; name: string; email: string };

export function CommandMenu({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 250);
  const sections = role === "ADMIN" ? ADMIN_NAV : EMPLOYEE_NAV;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: employees } = useQuery({
    queryKey: ["command-employees", debounced],
    queryFn: () => api<Paginated<EmployeeHit>>("/api/employees", { query: { search: debounced, pageSize: 6 } }),
    enabled: open && role === "ADMIN" && debounced.trim().length >= 2,
  });

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground shadow-soft transition-colors hover:border-foreground/15 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:w-64"
        aria-label="Search"
      >
        <Search className="size-4" />
        <span className="hidden flex-1 text-left md:inline">{role === "ADMIN" ? "Search employees, pages…" : "Search…"}</span>
        <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] md:inline">
          Ctrl K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search pages and employees">
        <CommandInput
          placeholder={role === "ADMIN" ? "Search employees by name, email or vehicle…" : "Jump to…"}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {employees?.items.length ? (
            <CommandGroup heading="Employees">
              {employees.items.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.name} ${e.email} ${debounced}`}
                  onSelect={() => go(`/admin/employees/${e.id}`)}
                >
                  <UserRound />
                  <span className="font-medium">{e.name}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">{e.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {sections.map((section, i) => (
            <CommandGroup key={section.label ?? i} heading={section.label ?? "Navigate"}>
              {section.items.map((item) => (
                <CommandItem key={item.href} value={item.title} onSelect={() => go(item.href)}>
                  <item.icon />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
