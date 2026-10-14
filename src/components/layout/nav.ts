import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Car,
  CreditCard,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Settings,
  TestTube2,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";

export type NavItem = { title: string; href: string; icon: LucideIcon; match?: string };
export type NavSection = { label?: string; items: NavItem[] };

export const ADMIN_NAV: NavSection[] = [
  {
    items: [
      { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { title: "My parking", href: "/employee/dashboard", icon: WalletCards, match: "/employee" },
    ],
  },
  {
    label: "Manage",
    items: [
      { title: "Employees", href: "/admin/employees", icon: Users },
      { title: "Vehicles", href: "/admin/vehicles", icon: Car },
      { title: "Parking Fees", href: "/admin/parking-fees", icon: Receipt },
      { title: "Payments", href: "/admin/payments", icon: CreditCard },
      { title: "Reports", href: "/admin/reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Razorpay Test", href: "/admin/razorpay-test", icon: TestTube2 },
      { title: "Audit Log", href: "/admin/audit-logs", icon: ScrollText },
      { title: "Settings", href: "/admin/settings/parking", icon: Settings, match: "/admin/settings" },
    ],
  },
];

export const EMPLOYEE_NAV: NavSection[] = [
  {
    items: [
      { title: "Dashboard", href: "/employee/dashboard", icon: LayoutDashboard },
      { title: "My Vehicle", href: "/employee/vehicle", icon: Car },
      { title: "Payments", href: "/employee/payments", icon: CreditCard, match: "/employee/pay" },
      { title: "Profile", href: "/employee/profile", icon: UserRound },
    ],
  },
];

const SEGMENT_LABELS: Record<string, string> = {
  admin: "Admin",
  employee: "My Parking",
  dashboard: "Dashboard",
  employees: "Employees",
  vehicles: "Vehicles",
  vehicle: "My Vehicle",
  "parking-fees": "Parking Fees",
  payments: "Payments",
  pay: "Pay",
  reports: "Reports",
  "razorpay-test": "Razorpay Test",
  settings: "Settings",
  parking: "Parking",
  "audit-logs": "Audit Log",
  profile: "Profile",
  receipt: "Receipt",
};

export function breadcrumbsFor(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];
  parts.forEach((part, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    const prev = parts[i - 1];
    const idLabel = prev === "pay" ? "Checkout" : prev === "payments" ? "Payment" : "Details";
    const label = SEGMENT_LABELS[part] ?? (part.length > 14 ? idLabel : decodeURIComponent(part));
    crumbs.push({ label, href });
  });
  return crumbs;
}

export function isActive(pathname: string, item: NavItem) {
  const base = item.match ?? item.href;
  return pathname === item.href || pathname.startsWith(`${base}/`) || pathname.startsWith(base);
}
