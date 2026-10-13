"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { EMPLOYEE_NAV, isActive } from "./nav";

/** Bottom navigation for employees on phones, where payments usually happen. */
export function MobileTabBar() {
  const pathname = usePathname();
  const items = EMPLOYEE_NAV.flatMap((s) => s.items);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden no-print"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors",
                  active ? "text-gold" : "text-white/55 hover:text-white",
                )}
              >
                <item.icon className="size-5" />
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
