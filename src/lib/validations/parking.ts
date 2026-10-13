import { z } from "zod";
import { monthSchema, paginationSchema, yearSchema } from "./common";

export const feeStatusSchema = z.enum(["DUE", "PAID", "OVERDUE", "CANCELLED"]);

export const parkingFeeListQuerySchema = paginationSchema.extend({
  status: feeStatusSchema.optional(),
  month: monthSchema.optional(),
  year: yearSchema.optional(),
  userId: z.string().optional(),
  vehicleId: z.string().optional(),
  search: z.string().trim().max(100).optional(),
});

export const feeGenerationSchema = z.object({
  month: monthSchema,
  year: yearSchema,
});

export const parkingFeeUpdateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("note"), notes: z.string().trim().max(500) }),
]);

const rupees = z
  .number({ error: "Enter an amount" })
  .min(0, "Amount cannot be negative")
  .max(100000, "Amount is too large");

export const parkingSettingsSchema = z.object({
  dueDay: z.number({ error: "Enter a day" }).int().min(1, "Between 1 and 28").max(28, "Between 1 and 28"),
  lateFee: rupees,
  feesEnabled: z.boolean(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(40),
  monthlyFee: rupees,
  active: z.boolean(),
});

export type FeeGenerationInput = z.infer<typeof feeGenerationSchema>;
export type ParkingFeeListQuery = z.output<typeof parkingFeeListQuerySchema>;
export type ParkingSettingsInput = z.infer<typeof parkingSettingsSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type ParkingFeeUpdateInput = z.infer<typeof parkingFeeUpdateSchema>;
