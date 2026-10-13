"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Loader2, UserRound } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

export type DirectoryPerson = { id: string; name: string; email: string; phone: string | null; jobTitle: string | null };

export function DirectoryPersonPicker({
  value,
  onSelect,
  invalid,
}: {
  value: DirectoryPerson | null;
  onSelect: (person: DirectoryPerson) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search.trim(), 300);

  const query = useQuery({
    queryKey: ["directory-users", debounced],
    queryFn: () => api<DirectoryPerson[]>("/api/directory/users", { query: { search: debounced } }),
    enabled: open,
    staleTime: 30_000,
    retry: false,
  });
  const people = query.data ?? [];
  const searching = query.isFetching || search.trim() !== debounced;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="email"
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className={cn("h-auto min-h-9 w-full justify-between px-3 py-2 font-normal", !value && "text-muted-foreground")}
        >
          {value ? (
            <span className="flex min-w-0 flex-col items-start text-left">
              <span className="truncate text-sm font-medium text-foreground">{value.name}</span>
              <span className="truncate text-xs text-muted-foreground">{value.email}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <UserRound className="size-4" /> Search your Microsoft directory
            </span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Name or email…" value={search} onValueChange={setSearch} />
          <CommandList>
            {query.isError ? (
              <p className="px-3 py-6 text-center text-sm text-destructive">{errorMessage(query.error)}</p>
            ) : searching && people.length === 0 ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching directory…
              </p>
            ) : (
              <>
                <CommandEmpty>
                  {debounced ? "No one found who isn't already in the portal." : "Everyone listed already has a portal account."}
                </CommandEmpty>
                <CommandGroup heading="Not yet in the portal">
                  {people.map((person) => (
                    <CommandItem
                      key={person.email}
                      value={person.email}
                      data-checked={value?.email === person.email}
                      onSelect={() => {
                        onSelect(person);
                        setOpen(false);
                      }}
                    >
                      <InitialsAvatar
                        name={person.name}
                        size="sm"
                        src={
                          person.id
                            ? `/api/directory/users/${person.id}/photo?email=${encodeURIComponent(person.email)}`
                            : undefined
                        }
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{person.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{person.email}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
