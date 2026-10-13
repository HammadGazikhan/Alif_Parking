import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
  RAZORPAY_KEY_ID: z.string().optional().default(""),
  RAZORPAY_KEY_SECRET: z.string().optional().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(""),
  MOCK_WEBHOOK_SECRET: z.string().optional().default(""),
  UPI_VPA: z.string().default("alifparking@upi"),
  UPI_PAYEE_NAME: z.string().default("Alif Cloud Consulting"),
  CRON_SECRET: z.string().optional().default(""),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

/** Parsed server environment. Read lazily so builds don't require runtime secrets. */
export function env(): ServerEnv {
  if (cached && process.env.NODE_ENV !== "test") return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid server environment: ${issues}`);
  }
  if (parsed.data.PAYMENT_PROVIDER === "razorpay") {
    const missing = (["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const).filter(
      (k) => !parsed.data[k],
    );
    if (missing.length) {
      throw new Error(`PAYMENT_PROVIDER=razorpay requires: ${missing.join(", ")}`);
    }
  }
  cached = parsed.data;
  return cached;
}

export function isMockPaymentsEnabled(): boolean {
  const e = env();
  return e.PAYMENT_PROVIDER === "mock" && e.NODE_ENV !== "production";
}
