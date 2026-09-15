import { z } from 'zod';

export const healthEventTypeSchema = z.enum(['SYMPTOM', 'MEDICATION', 'DIGESTIVE', 'DOCTOR_VISIT', 'CHECK_IN']);
const writableHealthEventTypeSchema = z.enum(['SYMPTOM', 'MEDICATION', 'DIGESTIVE', 'DOCTOR_VISIT']);
export const healthEventSeveritySchema = z.enum(['Mild', 'Moderate', 'Severe', 'Not specified']);
export const healthEventSourceSchema = z.enum(['Typed', 'Voice', 'Preset']);
export const healthEventStatusSchema = z.enum(['Confirmed', 'Needs monitoring', 'Prepared']);

const safeText = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\p{Cc}]+$/u);
const optionalText = (max: number) => z.string().trim().max(max).regex(/^[^\p{Cc}]*$/u);
const symptoms = z.array(safeText(200)).max(50).transform((items) => [...new Set(items)]);
const occurredAt = z.iso.datetime({ offset: true }).refine(
  (value) => new Date(value).getTime() <= Date.now() + 5 * 60 * 1000,
  { message: 'Event time cannot be more than five minutes in the future.' },
);

export const createHealthEventSchema = z.strictObject({
  type: writableHealthEventTypeSchema,
  title: safeText(160),
  eventDate: occurredAt,
  severity: healthEventSeveritySchema.default('Not specified'),
  symptoms,
  treatment: optionalText(2000).default(''),
  notes: safeText(5000),
  source: healthEventSourceSchema,
  status: healthEventStatusSchema.default('Confirmed'),
});

export const updateHealthEventSchema = z.strictObject({
  type: writableHealthEventTypeSchema.optional(),
  title: safeText(160).optional(),
  eventDate: occurredAt.optional(),
  severity: healthEventSeveritySchema.optional(),
  symptoms: symptoms.optional(),
  treatment: optionalText(2000).optional(),
  notes: safeText(5000).optional(),
  source: healthEventSourceSchema.optional(),
  status: healthEventStatusSchema.optional(),
}).refine(
  (input) => Object.keys(input).length > 0,
  { message: 'Provide at least one field to update.' },
);

export const healthEventIdSchema = z.uuid();

export const healthEventQuerySchema = z.strictObject({
  type: healthEventTypeSchema.optional(),
  severity: healthEventSeveritySchema.optional(),
  status: healthEventStatusSchema.optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).refine(
  ({ from, to }) => !from || !to || new Date(from).getTime() <= new Date(to).getTime(),
  { message: '`from` must be before or equal to `to`.' },
);

export type CreateHealthEventInput = z.infer<typeof createHealthEventSchema>;
export type UpdateHealthEventInput = z.infer<typeof updateHealthEventSchema>;
export type HealthEventQuery = z.infer<typeof healthEventQuerySchema>;
