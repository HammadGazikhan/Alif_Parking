import { AppShell } from "@/components/layout/app-shell";
import { requireAdminPage } from "@/server/auth/guards";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdminPage();
  return <AppShell user={user}>{children}</AppShell>;
}
