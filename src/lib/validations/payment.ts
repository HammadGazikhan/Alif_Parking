import { z } from "zod";
import { monthSchema, paginationSchema, yearSchema } from "./common";

/**
 * The only thing a client may send when starting a payment is which fee it
 * wants to pay. Amount, currency and payer are always derived server-side;
 * unknown keys (e.g. `amount`, `userId`) are stripped.
 */
export const createOrderSchema = z.object({
  feeId: z.string().min(1).max(64),
});

export const paymentStatusSchema = z.enum(["CREATED", "PENDING", "SUCCESS", "FAILED", "REFUNDED"]);

export const paymentListQuerySchema = paginationSchema.extend({
  status: paymentStatusSchema.optional(),
  search: z.string().trim().max(100).optional(),
  month: monthSchema.optional(),
  year: yearSchema.optional(),
});

export const reportQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  userId: z.string().optional(),
  status: z.enum(["DUE", "PAID", "OVERDUE", "CANCELLED"]).optional(),
});

export const exportQuerySchema = reportQuerySchema.extend({
  format: z.enum(["csv", "xlsx"]).default("csv"),
});

export const passListQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
});

export type PaymentListQuery = z.output<typeof paymentListQuerySchema>;
export type ReportQuery = z.output<typeof reportQuerySchema>;
