"use client";

import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { logoutAction } from "@/app/actions/auth";
import type { ShellUser } from "./sidebar";

export function UserMenu({ user }: { user: ShellUser }) {
  const avatar = user.avatarType ? `/api/employees/${user.id}/avatar` : undefined;
  const roleLabel = user.role === "ADMIN" ? "Administrator" : "Employee";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-full p-0.5 pr-0.5 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:pr-3"
        aria-label="Account menu"
      >
        <InitialsAvatar name={user.name} size="sm" src={avatar} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-xs font-semibold">{user.name}</span>
          <span className="block text-[10px] text-muted-foreground">{user.designation || roleLabel}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-3">
            <InitialsAvatar name={user.name} src={avatar} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              {user.designation ? <p className="truncate text-xs text-muted-foreground">{user.designation}</p> : null}
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === "ADMIN" ? (
          <DropdownMenuItem asChild>
            <Link href="/admin/settings/parking">
              <Settings /> Parking settings
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/employee/profile">
              <UserRound /> My profile
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={(e) => {
            e.preventDefault();
            void logoutAction();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
