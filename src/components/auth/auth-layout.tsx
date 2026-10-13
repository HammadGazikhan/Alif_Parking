import { BellRing, QrCode, ShieldCheck } from "lucide-react";
import { AlifLogo } from "@/components/brand/alif-logo";
import { ParkingVisual } from "./parking-visual";

const highlights = [
  { icon: QrCode, title: "Scan & pay with UPI", text: "Pay your monthly parking fee in seconds." },
  { icon: ShieldCheck, title: "Gateway-verified", text: "Every payment is confirmed server-side." },
  { icon: BellRing, title: "Timely reminders", text: "Due and overdue alerts, right in the portal." },
];

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="ink-surface relative hidden overflow-hidden lg:flex lg:flex-col">
        <div className="bay-grid absolute inset-0" aria-hidden />
        <div
          className="absolute -right-32 bottom-[-12rem] size-[34rem] rounded-full bg-gold/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-1 flex-col justify-between p-10 xl:p-14">
          <AlifLogo />

          <div className="max-w-xl">
            <p className="eyebrow text-gold">Employee Parking Platform</p>
            <h2 className="mt-4 text-4xl leading-[1.1] font-bold tracking-tight text-white xl:text-5xl">
              Parking, handled with the same care as your cloud.
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/65">
              Manage vehicles, monthly parking fees and payments for every Alif team member — from one secure,
              modern workspace.
            </p>

            <div className="glass-panel mt-10 rounded-3xl p-5">
              <ParkingVisual className="h-auto w-full" />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            {highlights.map((h) => (
              <div key={h.title} className="glass-panel rounded-2xl p-4">
                <h.icon className="size-4 text-gold" />
                <p className="mt-3 text-[13px] font-semibold text-white">{h.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/55">{h.text}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="relative flex flex-col bg-card">
        <div className="flex items-center justify-between p-6 lg:hidden">
          <AlifLogo tone="dark" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">{children}</div>
        <footer className="px-6 pb-6 text-center text-[11px] text-muted-foreground sm:px-10">
          © {new Date().getFullYear()} Alif Cloud Consulting · Internal use only
        </footer>
      </main>
    </div>
  );
}
