import env from '../../config/env.js';
import {
  ProviderMalformedOutputError,
  ProviderRefusalError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  type ExtractionInput,
  type ExtractionResult,
  type HealthAiProvider,
} from '../health-ai-provider.js';
import { extractionOutputSchema } from '../../schemas/ai-extraction.schemas.js';
import { sanitizeEducationalContext } from '../educational-content-guard.js';

export const PROMPT_VERSION = 'ollama-extract-v2';

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['SYMPTOM', 'MEDICATION', 'DIGESTIVE', 'DOCTOR_VISIT'] },
    title: { type: 'string' },
    severity: { type: 'string', enum: ['Mild', 'Moderate', 'Severe', 'Not specified'] },
    symptoms: { type: 'array', items: { type: 'string' } },
    treatment: { type: 'string' },
    educationalContext: { type: 'array', items: { type: 'string' } },
  },
  required: ['type', 'title', 'severity', 'symptoms', 'treatment', 'educationalContext'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You convert a patient's plain-language health observation into a structured draft,
plus general educational context. You are never speaking to or about this specific patient's case.

Extraction rules:
- Never diagnose a condition and never recommend a treatment, medication, or dosage change.
- "treatment" only restates what the patient already said they did, or an empty string.
- Choose exactly one type: SYMPTOM, MEDICATION, DIGESTIVE, or DOCTOR_VISIT.
- "title" is a short, factual, patient-facing summary under 12 words.
- "symptoms" lists short factual phrases drawn only from the text. Do not invent details.

"educationalContext" rules (0 to 4 short bullets, each under 40 words):
- General, textbook-style patient education about the symptom category mentioned, written for
  anyone who might have these symptoms — never about this specific patient.
- Forbidden phrasing, in any form: "you have", "you are experiencing", "your condition",
  "this is/means [a diagnosis]", "you should take/use/try", "I recommend/suggest/advise",
  any medication name paired with a dose, any prescription language.
- Allowed phrasing: "commonly associated with", "often discussed in relation to",
  "frequently linked to", general lifestyle factors (hydration, sleep, stress) stated generically.
- If nothing generic and safe applies, return an empty array. Do not stretch to fill 4 items.
- No URLs, no citations, no source names — this is your own general knowledge only.

If the text is unclear, unrelated to health, or you should not extract it, respond with
{"refuse": true, "reason": "<short reason>"} instead of the schema.
Respond with JSON only, matching the schema. No prose, no markdown fences.`;

function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  signal?.addEventListener('abort', () => controller.abort());
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export class OllamaProvider implements HealthAiProvider {
  async extractObservation(input: ExtractionInput): Promise<ExtractionResult> {
    const { signal, clear } = withTimeout(undefined, 20_000);

    let response: Response;
    try {
      response = await fetch(`${env.OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          model: env.OLLAMA_MODEL,
          system: SYSTEM_PROMPT,
          prompt: input.observation,
          format: RESPONSE_JSON_SCHEMA,
          stream: false,
          options: { temperature: 0.1 },
        }),
      });
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') {
        throw new ProviderTimeoutError('The local model did not respond in time.');
      }
      throw new ProviderUnavailableError('The local Ollama provider is not reachable.');
    } finally {
      clear();
    }

    if (!response.ok) {
      throw new ProviderUnavailableError(`Ollama responded with status ${response.status}.`);
    }

    const payload = (await response.json().catch(() => null)) as { response?: string } | null;
    if (!payload?.response) {
      throw new ProviderMalformedOutputError('Ollama returned an empty response.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.response);
    } catch {
      throw new ProviderMalformedOutputError('Ollama did not return valid JSON.');
    }

    if (
      typeof parsed === 'object' && parsed !== null && 'refuse' in parsed
      && (parsed as { refuse?: unknown }).refuse === true
    ) {
      throw new ProviderRefusalError('The model declined to extract this observation.');
    }

    const result = extractionOutputSchema.safeParse(parsed);
    if (!result.success) {
      throw new ProviderMalformedOutputError('Ollama output did not match the extraction schema.');
    }

    return {
      ...result.data,
      educationalContext: sanitizeEducationalContext(result.data.educationalContext),
    };
  }
}
