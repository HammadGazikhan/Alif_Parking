import { z } from "zod";
import { booleanParam, paginationSchema } from "./common";

const phonePattern = /^[+]?[\d\s-]{7,16}$/;

/** A directory phone is kept only when it already fits the employee form. */
export function acceptDirectoryPhone(value: string | null | undefined): string | null {
  const phone = value?.trim() ?? "";
  return phone && phonePattern.test(phone) ? phone : null;
}

const employeeDetailsSchema = z.object({
  name: z.string().trim().min(2, "Full name is required").max(100),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || phonePattern.test(v), "Enter a valid phone number"),
  designation: z.string().trim().max(80, "Designation is too long"),
  parkingEligible: z.boolean(),
  freePass: z.boolean(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
});

/** The work email must be picked from the Microsoft directory; it cannot be changed later. */
export const employeeCreateSchema = employeeDetailsSchema.extend({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Select an employee from the Microsoft directory")
    .pipe(z.email("Enter a valid email address")),
  /** Entra object id, used only to copy a profile photo. Omitted for edits and tests. */
  directoryId: z.string().uuid().optional(),
});

export const employeeUpdateSchema = employeeDetailsSchema.partial();

export const employeeStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const employeeListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  hasVehicle: booleanParam,
  parkingEligible: booleanParam,
});

export const directorySearchQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
});

export type EmployeeFormValues = z.input<typeof employeeCreateSchema>;
export type EmployeeCreateInput = z.output<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.output<typeof employeeUpdateSchema>;
export type EmployeeListQuery = z.output<typeof employeeListQuerySchema>;
