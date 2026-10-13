import { testDatabaseUrl } from "./test-env";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.PAYMENT_PROVIDER = "mock";
process.env.MOCK_WEBHOOK_SECRET ||= "test-mock-webhook-secret";
process.env.AUTH_SECRET ||= "test-auth-secret-test-auth-secret";
process.env.CRON_SECRET ||= "test-cron-secret";
process.env.EMAIL_NOTIFICATIONS_ENABLED = "false";
