import type { CurrentUser } from "@/server/auth/guards";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MobileTabBar } from "./mobile-tab-bar";

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const shellUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    designation: user.designation,
    avatarType: user.avatarType,
  };
  return (
    <div className="min-h-screen">
      <div className="no-print">
        <Sidebar user={shellUser} />
      </div>
      <div className="flex min-h-screen flex-col lg:pl-[260px]">
        <Header user={shellUser} />
        <main className={user.role === "EMPLOYEE" ? "flex-1 pb-24 lg:pb-0" : "flex-1"}>{children}</main>
      </div>
      {user.role === "EMPLOYEE" ? <MobileTabBar /> : null}
    </div>
  );
}
