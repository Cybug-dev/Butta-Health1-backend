import type { healthEventSeveritySchema } from '../schemas/health-event.schemas.js';
import type { z } from 'zod';

type Severity = z.infer<typeof healthEventSeveritySchema>;

export type ExtractionInput = {
  observation: string;
  source: 'Typed' | 'Voice' | 'Preset';
};

export type ExtractionResult = {
  type: 'SYMPTOM' | 'MEDICATION' | 'DIGESTIVE' | 'DOCTOR_VISIT';
  title: string;
  severity: Severity;
  symptoms: string[];
  treatment: string;
  educationalContext: string[];
};

export class ProviderUnavailableError extends Error {}
export class ProviderTimeoutError extends Error {}
export class ProviderRefusalError extends Error {}
export class ProviderMalformedOutputError extends Error {}

/**
 * Provider-neutral boundary for hosted/local model calls. Controllers and services
 * depend only on this contract so the underlying model can be swapped (Ollama today,
 * a hosted provider later) without touching request handling, persistence, or the
 * frontend API contract.
 */
export interface HealthAiProvider {
  extractObservation(input: ExtractionInput): Promise<ExtractionResult>;
}
