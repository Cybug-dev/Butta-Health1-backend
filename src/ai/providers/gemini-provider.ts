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

export const GEMINI_PROMPT_VERSION = 'gemini-extract-v2';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    type: { type: 'STRING', enum: ['SYMPTOM', 'MEDICATION', 'DIGESTIVE', 'DOCTOR_VISIT'] },
    title: { type: 'STRING' },
    severity: { type: 'STRING', enum: ['Mild', 'Moderate', 'Severe', 'Not specified'] },
    symptoms: { type: 'ARRAY', items: { type: 'STRING' } },
    treatment: { type: 'STRING' },
    educationalContext: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 4 },
    refuse: { type: 'BOOLEAN' },
    reason: { type: 'STRING' },
  },
  required: ['type', 'title', 'severity', 'symptoms', 'treatment', 'educationalContext', 'refuse'],
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

Always set "refuse". If the text is unclear, unrelated to health, or you should not extract it,
set refuse to true and put a short reason in "reason"; otherwise set refuse to false and leave
every other field filled in normally, and "reason" empty.
Respond with JSON only, matching the schema. No prose, no markdown fences.`;

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

export class GeminiProvider implements HealthAiProvider {
  async extractObservation(input: ExtractionInput): Promise<ExtractionResult> {
    const { signal, clear } = withTimeout(20_000);

    let response: Response;
    try {
      response = await fetch(
        `${env.GEMINI_BASE_URL}/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: input.observation }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
        },
      );
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') {
        throw new ProviderTimeoutError('Gemini did not respond in time.');
      }
      throw new ProviderUnavailableError('The Gemini provider is not reachable.');
    } finally {
      clear();
    }

    if (response.status === 429) {
      throw new ProviderUnavailableError('Gemini rate limit reached. Try again shortly.');
    }
    if (!response.ok) {
      throw new ProviderUnavailableError(`Gemini responded with status ${response.status}.`);
    }

    const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
    if (payload?.promptFeedback?.blockReason) {
      throw new ProviderRefusalError(`Gemini blocked this request: ${payload.promptFeedback.blockReason}.`);
    }

    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new ProviderMalformedOutputError('Gemini returned an empty response.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderMalformedOutputError('Gemini did not return valid JSON.');
    }

    if (
      typeof parsed === 'object' && parsed !== null && 'refuse' in parsed
      && (parsed as { refuse?: unknown }).refuse === true
    ) {
      throw new ProviderRefusalError('The model declined to extract this observation.');
    }

    const { refuse: _refuse, reason: _reason, ...extraction } = parsed as Record<string, unknown>;
    const result = extractionOutputSchema.safeParse(extraction);
    if (!result.success) {
      throw new ProviderMalformedOutputError('Gemini output did not match the extraction schema.');
    }

    return {
      ...result.data,
      educationalContext: sanitizeEducationalContext(result.data.educationalContext),
    };
  }
}
