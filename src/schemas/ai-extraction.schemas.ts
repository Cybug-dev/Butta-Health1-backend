import { z } from 'zod';
import { healthEventSeveritySchema, healthEventSourceSchema } from './health-event.schemas.js';

const safeText = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\p{Cc}]+$/u);

export const extractionRequestSchema = z.strictObject({
  observation: safeText(2000),
  source: healthEventSourceSchema,
  symptomTags: z.array(safeText(60)).max(12).transform((items) => [...new Set(items)]).default([]),
});

const extractableTypeSchema = z.enum(['SYMPTOM', 'MEDICATION', 'DIGESTIVE', 'DOCTOR_VISIT']);

export const extractionOutputSchema = z.strictObject({
  type: extractableTypeSchema,
  title: safeText(160),
  severity: healthEventSeveritySchema,
  symptoms: z.array(safeText(200)).max(20).transform((items) => [...new Set(items)]),
  treatment: z.string().trim().max(2000).regex(/^[^\p{Cc}]*$/u),
  educationalContext: z.array(safeText(280)).max(4).default([]),
});

export type ExtractionRequestInput = z.infer<typeof extractionRequestSchema>;
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
