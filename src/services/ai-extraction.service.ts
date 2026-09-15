import { prisma } from '../config/database.js';
import { ApiError } from '../errors/api-error.js';
import {
  ProviderMalformedOutputError,
  ProviderRefusalError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  type HealthAiProvider,
} from '../ai/health-ai-provider.js';
import { detectUrgentSymptoms, URGENT_ADVISORY } from '../ai/urgent-symptom-rules.js';
import { PROMPT_VERSION as OLLAMA_PROMPT_VERSION } from '../ai/providers/ollama-provider.js';
import { GEMINI_PROMPT_VERSION } from '../ai/providers/gemini-provider.js';
import { OPENROUTER_PROMPT_VERSION } from '../ai/providers/openrouter-provider.js';
import type { ExtractionRequestInput } from '../schemas/ai-extraction.schemas.js';
import { requireAiConsent } from './ai-consent.service.js';
import env from '../config/env.js';

function inputPreview(observation: string): string {
  // Auditability without storing the full raw note: a short, truncated preview only.
  return observation.slice(0, 160);
}

function providerAuditFields() {
  if (env.AI_PROVIDER === 'gemini') {
    return { model: env.GEMINI_MODEL, promptVersion: GEMINI_PROMPT_VERSION };
  }
  if (env.AI_PROVIDER === 'openrouter') {
    return { model: env.OPENROUTER_MODEL, promptVersion: OPENROUTER_PROMPT_VERSION };
  }
  return { model: env.OLLAMA_MODEL, promptVersion: OLLAMA_PROMPT_VERSION };
}

async function recordExtraction(params: {
  userId: string;
  status: 'DRAFTED' | 'FAILED' | 'REFUSED';
  observation: string;
  urgentFlag: boolean;
}) {
  await prisma.aiExtraction.create({
    data: {
      userId: params.userId,
      provider: env.AI_PROVIDER,
      ...providerAuditFields(),
      status: params.status,
      inputPreview: inputPreview(params.observation),
      urgentFlag: params.urgentFlag,
    },
  });
}

export async function extractHealthEvent(
  provider: HealthAiProvider,
  userId: string,
  input: ExtractionRequestInput,
) {
  const consented = await requireAiConsent(userId);
  if (!consented) {
    throw new ApiError(403, 'AI_CONSENT_REQUIRED', 'AI-assisted capture requires consent before use.');
  }

  const urgentFlag = detectUrgentSymptoms(input.observation);

  try {
    const result = await provider.extractObservation({ observation: input.observation, source: input.source });
    await recordExtraction({ userId, status: 'DRAFTED', observation: input.observation, urgentFlag });

    const symptoms = [...new Set([...input.symptomTags, ...result.symptoms])];

    return {
      draft: {
        type: result.type,
        title: result.title,
        eventDate: new Date().toISOString(),
        severity: urgentFlag ? 'Severe' as const : result.severity,
        symptoms: symptoms.length ? symptoms : ['Patient-reported observation'],
        treatment: result.treatment,
        notes: input.observation,
        source: input.source,
      },
      // Urgent cases surface the escalation advisory instead of general education,
      // so the UI never looks like it is downplaying a potentially serious symptom.
      educationalContext: urgentFlag ? [] : result.educationalContext,
      safety: urgentFlag ? { urgent: true, advisory: URGENT_ADVISORY } : { urgent: false, advisory: null },
    };
  } catch (error) {
    if (error instanceof ProviderRefusalError) {
      await recordExtraction({ userId, status: 'REFUSED', observation: input.observation, urgentFlag });
      throw new ApiError(422, 'AI_EXTRACTION_REFUSED', 'The extraction could not be completed for this text.');
    }

    await recordExtraction({ userId, status: 'FAILED', observation: input.observation, urgentFlag });

    if (error instanceof ProviderTimeoutError) {
      throw new ApiError(504, 'AI_PROVIDER_TIMEOUT', 'The AI provider did not respond in time.');
    }
    if (error instanceof ProviderUnavailableError) {
      throw new ApiError(503, 'AI_PROVIDER_UNAVAILABLE', 'The AI provider is not available right now.');
    }
    if (error instanceof ProviderMalformedOutputError) {
      throw new ApiError(502, 'AI_PROVIDER_MALFORMED_OUTPUT', 'The AI provider returned an unusable response.');
    }
    throw error;
  }
}
