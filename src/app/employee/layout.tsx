import { AppShell } from "@/components/layout/app-shell";
import { requireEmployeePage } from "@/server/auth/guards";

export default async function EmployeeLayout({ children }: LayoutProps<"/employee">) {
  const user = await requireEmployeePage();
  return <AppShell user={user}>{children}</AppShell>;
}
