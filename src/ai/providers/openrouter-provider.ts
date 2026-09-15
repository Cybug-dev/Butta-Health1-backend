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

export const OPENROUTER_PROMPT_VERSION = 'openrouter-extract-v3';

// response_format: json_schema is intentionally NOT used here. On OpenRouter's
// free-tier endpoints it has been observed to produce truncated or non-JSON
// response bodies (the HTTP call succeeds but response.json() fails outright),
// a known upstream reliability gap rather than something fixable by changing
// the schema. Prompting for a plain fenced JSON block and parsing it manually
// sidesteps that failure mode entirely — the same approach used successfully
// elsewhere for free-tier OpenRouter models.
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
set refuse to true and put a short reason in "reason"; otherwise set refuse to false, leave
every other field filled in normally, and set "reason" to an empty string.

Respond with exactly one fenced code block, and nothing else before or after it:
\`\`\`json
{"type":"SYMPTOM","title":"...","severity":"Mild","symptoms":["..."],"treatment":"","educationalContext":["..."],"refuse":false,"reason":""}
\`\`\`
Do not include any reasoning, explanation, or text outside the fenced block.`;

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  error?: { message?: string; code?: unknown };
};

const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

function extractJsonBlock(text: string): string {
  const match = text.match(JSON_FENCE_PATTERN);
  return match ? match[1]!.trim() : text.trim();
}

// OpenRouter's own free-tier endpoints intermittently cut the response stream
// early under load, which surfaces here as a non-JSON or empty body rather
// than a clean HTTP error (a known, still-open issue upstream, not something
// fixable by changing the request shape). One retry absorbs that blip.
class TransientOpenRouterError extends Error {}

// Free-tier per-minute limits are shared across all traffic on the key, so a
// 429 is routinely just "try again in a few seconds," not a hard failure.
// Retried once after a short delay, same as every other transient failure.
class RateLimitedError extends Error {}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptExtraction(input: ExtractionInput): Promise<ExtractionResult> {
  const { signal, clear } = withTimeout(30_000);

  let response: Response;
  try {
    response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': env.API_PUBLIC_URL,
        'X-Title': 'Butta Health',
      },
      signal,
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: input.observation },
        ],
      }),
    });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      throw new ProviderTimeoutError('OpenRouter did not respond in time.');
    }
    throw new TransientOpenRouterError('The OpenRouter provider is not reachable.');
  } finally {
    clear();
  }

  const rawBody = await response.text();

  if (response.status === 429) {
    throw new RateLimitedError('OpenRouter rate limit reached.');
  }
  if (!response.ok) {
    throw new TransientOpenRouterError(`OpenRouter responded with status ${response.status}.`);
  }

  let payload: OpenRouterResponse | null;
  try {
    payload = JSON.parse(rawBody) as OpenRouterResponse;
  } catch {
    payload = null;
  }
  if (!payload) {
    throw new TransientOpenRouterError('OpenRouter returned a body that could not be parsed as JSON.');
  }
  if (payload.error) {
    throw new TransientOpenRouterError(payload.error.message || 'OpenRouter returned an error.');
  }

  const text = payload.choices?.[0]?.message?.content;
  if (!text) {
    throw new TransientOpenRouterError('OpenRouter returned an empty response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonBlock(text));
  } catch {
    throw new TransientOpenRouterError('OpenRouter did not return a parseable JSON block.');
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
    throw new ProviderMalformedOutputError('OpenRouter output did not match the extraction schema.');
  }

  return {
    ...result.data,
    educationalContext: sanitizeEducationalContext(result.data.educationalContext),
  };
}

export class OpenRouterProvider implements HealthAiProvider {
  async extractObservation(input: ExtractionInput): Promise<ExtractionResult> {
    try {
      return await attemptExtraction(input);
    } catch (error) {
      if (!(error instanceof TransientOpenRouterError) && !(error instanceof RateLimitedError)) {
        throw error;
      }
      if (error instanceof RateLimitedError) await delay(3_000);
      try {
        return await attemptExtraction(input);
      } catch (retryError) {
        if (retryError instanceof TransientOpenRouterError || retryError instanceof RateLimitedError) {
          throw new ProviderUnavailableError(retryError.message);
        }
        throw retryError;
      }
    }
  }
}
