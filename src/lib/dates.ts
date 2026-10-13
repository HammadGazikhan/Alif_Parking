/**
 * Date helpers. All business dates are evaluated in India Standard Time so that
 * server and client render identical strings and billing periods line up with
 * the company calendar regardless of where the server runs.
 */
export const APP_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MINUTES = 330;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

export function formatBillingPeriod(month: number, year: number, short = false): string {
  return `${short ? MONTH_SHORT[month - 1] : monthName(month)} ${year}`;
}

/** Current calendar month/year in IST. */
export function currentPeriod(now: Date = new Date()): { month: number; year: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return { month: ist.getUTCMonth() + 1, year: ist.getUTCFullYear() };
}

export function shiftPeriod(
  period: { month: number; year: number },
  deltaMonths: number,
): { month: number; year: number } {
  const index = period.year * 12 + (period.month - 1) + deltaMonths;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function periodKey(p: { month: number; year: number }): number {
  return p.year * 100 + p.month;
}

/** Due date = end of `dueDay` (23:59:59 IST) in the billing month. */
export function computeDueDate(month: number, year: number, dueDay: number): Date {
  const utcMs = Date.UTC(year, month - 1, dueDay, 23, 59, 59) - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}

/** 23:59:59 IST on the IST calendar day that is `days` after `from`. */
export function endOfIstDayAfter(from: Date, days: number): Date {
  const ist = new Date(from.getTime() + days * DAY_MS + IST_OFFSET_MINUTES * 60 * 1000);
  return computeDueDate(ist.getUTCMonth() + 1, ist.getUTCFullYear(), ist.getUTCDate());
}

export function daysOverdue(dueDate: Date, now: Date = new Date()): number {
  const diff = now.getTime() - dueDate.getTime();
  return diff > 0 ? Math.ceil(diff / DAY_MS) : 0;
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const dateLongFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "long",
  year: "numeric",
});
const dayMonthFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "short",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

type DateInput = Date | string | null | undefined;

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d ? dateFormatter.format(d) : fallback;
}

export function formatDateLong(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d ? dateLongFormatter.format(d) : fallback;
}

export function formatDayMonth(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d ? dayMonthFormatter.format(d) : fallback;
}

export function formatDateTime(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  return d ? dateTimeFormatter.format(d).replace(/\b(am|pm)\b/, (m) => m.toUpperCase()) : fallback;
}

/** "Good morning" / "Good afternoon" / "Good evening" in IST. */
export function greetingFor(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, hour: "2-digit", hour12: false }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
