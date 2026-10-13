"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import type { Role } from "@/generated/prisma/browser";
import { AlifLogo } from "@/components/brand/alif-logo";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, EMPLOYEE_NAV, isActive } from "./nav";

export type ShellUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  designation: string | null;
  avatarType: string | null;
};

export function SidebarContent({ user, onNavigate }: { user: ShellUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = user.role === "ADMIN" ? ADMIN_NAV : EMPLOYEE_NAV;

  return (
    <div className="ink-surface flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link href={user.role === "ADMIN" ? "/admin/dashboard" : "/employee/dashboard"} onClick={onNavigate}>
          <AlifLogo />
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main">
        {sections.map((section, i) => (
          <div key={section.label ?? i}>
            {section.label ? <p className="eyebrow mb-2 px-3 text-white/35">{section.label}</p> : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-gold/60",
                        active
                          ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
                          : "text-white/60 hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute inset-y-0 left-0 w-[3px] rounded-l-[3px] bg-gold transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                      <item.icon
                        className={cn(
                          "size-[18px] transition-colors",
                          active ? "text-gold" : "text-white/45 group-hover:text-white/80",
                        )}
                      />
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3">
        <div className="glass-panel flex items-center gap-3 rounded-2xl p-3">
          <InitialsAvatar
            name={user.name}
            size="sm"
            className="bg-gold text-ink"
            src={user.avatarType ? `/api/employees/${user.id}/avatar` : undefined}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{user.name}</p>
            <p className="truncate text-[11px] text-white/45">
              {user.role === "ADMIN" ? "Administrator" : user.email}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex size-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:outline-none"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ user }: { user: ShellUser }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-white/5 lg:block">
      <SidebarContent user={user} />
    </aside>
  );
}
