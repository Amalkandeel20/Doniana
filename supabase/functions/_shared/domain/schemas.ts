import { z } from "zod";
import { normalizeIsraeliMobile } from "./phone.ts";
import { isValidLocalDate } from "./time.ts";

// Error messages are i18n keys; the UI translates them (src/i18n).
export const customerNameSchema = z
  .string()
  .trim()
  .min(2, "validation.name_short")
  .max(80, "validation.name_long")
  .refine((v) => /^[\p{L}\p{M}][\p{L}\p{M}\s'\u2019.-]*$/u.test(v), "validation.name_invalid")
  .refine((v) => (v.match(/\p{L}/gu) ?? []).length >= 2, "validation.name_short");

export const customerPhoneSchema = z
  .string()
  .trim()
  .min(1, "validation.phone_required")
  .refine((v) => normalizeIsraeliMobile(v) !== null, "validation.phone_invalid");

export const customerDetailsSchema = z.object({
  customerName: customerNameSchema,
  customerPhone: customerPhoneSchema,
});
export type CustomerDetails = z.infer<typeof customerDetailsSchema>;

const localDateSchema = z.string().refine(isValidLocalDate, "validation.date_invalid");

export const availabilityRequestSchema = z.object({
  serviceId: z.string().uuid(),
  addonIds: z.array(z.string().uuid()).max(5).default([]),
  locationId: z.string().uuid().nullable().default(null),
  fromDate: localDateSchema,
  days: z.number().int().min(1).max(42),
});
export type AvailabilityRequest = z.infer<typeof availabilityRequestSchema>;

export const createBookingRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  serviceId: z.string().uuid(),
  addonIds: z.array(z.string().uuid()).max(5).default([]),
  locationId: z.string().uuid().nullable().default(null),
  startsAt: z.string().datetime({ offset: true }),
  customerName: customerNameSchema,
  customerPhone: customerPhoneSchema,
  /** Honeypot: real users never see or fill this field. */
  website: z.string().max(0).optional().default(""),
  turnstileToken: z.string().max(4096).optional(),
});
export type CreateBookingRequest = z.input<typeof createBookingRequestSchema>;

export const manageRequestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/),
  action: z.enum(["view", "cancel"]),
});
export type ManageRequest = z.infer<typeof manageRequestSchema>;

export const adminCreateAppointmentSchema = z.object({
  serviceId: z.string().uuid(),
  addonIds: z.array(z.string().uuid()).max(5).default([]),
  locationId: z.string().uuid().nullable().default(null),
  startsAt: z.string().datetime({ offset: true }),
  customerName: customerNameSchema,
  customerPhone: customerPhoneSchema,
  notes: z.string().max(1000).optional().default(""),
  allowOutsideHours: z.boolean().default(false),
  notifyCustomer: z.boolean().default(true),
});
export type AdminCreateAppointment = z.input<typeof adminCreateAppointmentSchema>;
