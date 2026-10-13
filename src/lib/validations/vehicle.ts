import { z } from "zod";
import { normalizeVehicleNumber, VEHICLE_NUMBER_PATTERN } from "@/lib/vehicle";
import { paginationSchema } from "./common";

export const vehicleFormSchema = z.object({
  userId: z.string().min(1, "Select an employee"),
  number: z
    .string()
    .trim()
    .min(1, "Vehicle number is required")
    .transform(normalizeVehicleNumber)
    .refine((v) => VEHICLE_NUMBER_PATTERN.test(v), "Enter a valid registration number, e.g. MH12AB1234"),
  categoryId: z.string().min(1, "Select a vehicle category"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const vehicleUpdateSchema = vehicleFormSchema.partial();

export const vehicleListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  userId: z.string().optional(),
});

export type VehicleFormValues = z.input<typeof vehicleFormSchema>;
export type VehicleInput = z.output<typeof vehicleFormSchema>;
export type VehicleUpdateInput = z.output<typeof vehicleUpdateSchema>;
export type VehicleListQuery = z.output<typeof vehicleListQuerySchema>;
