import env from '../config/env.js';
import { OllamaProvider } from './providers/ollama-provider.js';
import { GeminiProvider } from './providers/gemini-provider.js';
import { OpenRouterProvider } from './providers/openrouter-provider.js';
import type { HealthAiProvider } from './health-ai-provider.js';

function buildProvider(): HealthAiProvider {
  switch (env.AI_PROVIDER) {
    case 'ollama':
      return new OllamaProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'openrouter':
      return new OpenRouterProvider();
    default:
      throw new Error(`Unsupported AI_PROVIDER: ${env.AI_PROVIDER as string}`);
  }
}

let cached: HealthAiProvider | undefined;

export function getHealthAiProvider(): HealthAiProvider {
  cached ??= buildProvider();
  return cached;
}
