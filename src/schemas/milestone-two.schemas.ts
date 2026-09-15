import { z } from 'zod';
import { healthEventSeveritySchema } from './health-event.schemas.js';
import { isIanaTimezone } from '../utils/zoned-date.js';

const timezone = z.string().trim().min(1).max(100).refine(isIanaTimezone, {
  message: 'Provide a valid IANA timezone.',
});
const safeText = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\p{Cc}]+$/u);

export const timezoneQuerySchema = z.strictObject({
  timezone: timezone.default('UTC'),
});

export const checkInIdSchema = z.uuid();

export const checkInResponseSchema = z.strictObject({
  notes: safeText(2000),
  severity: healthEventSeveritySchema.default('Not specified'),
  symptoms: z.array(safeText(200)).max(20).transform((items) => [...new Set(items)]).default([]),
});

export const notificationPreferenceSchema = z.strictObject({
  eventReminders: z.boolean(),
  weeklySummary: z.boolean(),
  dailyCheckIn: z.boolean(),
  checkInTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
  timezone,
});

export type CheckInResponseInput = z.infer<typeof checkInResponseSchema>;
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;
