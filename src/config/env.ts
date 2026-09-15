import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// This resolves to the project root from both src/config and dist/config.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

type VariableName = 'NODE_ENV' | 'PORT' | 'DATABASE_URL' | 'CLIENT_URL'
  | 'JWT_SECRET' | 'JWT_EXPIRES_IN_SECONDS' | 'AI_PROVIDER' | 'OLLAMA_BASE_URL' | 'OLLAMA_MODEL'
  | 'API_PUBLIC_URL' | 'GEMINI_API_KEY' | 'GEMINI_BASE_URL' | 'GEMINI_MODEL'
  | 'OPENROUTER_API_KEY' | 'OPENROUTER_BASE_URL' | 'OPENROUTER_MODEL';

function invalid(name: VariableName, reason: string): never {
  throw Object.assign(new Error(`Invalid configuration: ${name} ${reason}.`), {
    code: 'ENV_CONFIG',
  });
}

function required(name: VariableName): string {
  const value = process.env[name]?.trim();
  if (!value) invalid(name, 'is required');
  return value;
}

function optional(name: VariableName, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function parseUrl(name: VariableName, value: string): URL {
  try {
    return new URL(value);
  } catch {
    invalid(name, 'must be a valid URL');
  }
}

const NODE_ENV = required('NODE_ENV');
if (NODE_ENV !== 'development' && NODE_ENV !== 'test' && NODE_ENV !== 'production') {
  invalid('NODE_ENV', 'must be development, test, or production');
}

const port = required('PORT');
const PORT = Number(port);
if (!/^\d+$/.test(port) || !Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  invalid('PORT', 'must be an integer between 1 and 65535');
}

const DATABASE_URL = required('DATABASE_URL');
const databaseUrl = parseUrl('DATABASE_URL', DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    !databaseUrl.hostname || !databaseUrl.username || databaseUrl.pathname.length < 2) {
  invalid('DATABASE_URL', 'must be a PostgreSQL connection URL with a host, user, and database');
}

const clientUrl = parseUrl('CLIENT_URL', required('CLIENT_URL'));
if (!['http:', 'https:'].includes(clientUrl.protocol) || clientUrl.username ||
    clientUrl.password || clientUrl.pathname !== '/' || clientUrl.search || clientUrl.hash) {
  invalid('CLIENT_URL', 'must be an HTTP or HTTPS origin without credentials, a path, query, or fragment');
}

const JWT_SECRET = required('JWT_SECRET');
if (!/^[a-fA-F0-9]{64}$/.test(JWT_SECRET)) {
  invalid('JWT_SECRET', 'must be a randomly generated 32-byte key encoded as 64 hexadecimal characters');
}

const lifetime = required('JWT_EXPIRES_IN_SECONDS');
const JWT_EXPIRES_IN_SECONDS = Number(lifetime);
if (!/^\d+$/.test(lifetime) || !Number.isInteger(JWT_EXPIRES_IN_SECONDS)
    || JWT_EXPIRES_IN_SECONDS < 60 || JWT_EXPIRES_IN_SECONDS > 86400) {
  invalid('JWT_EXPIRES_IN_SECONDS', 'must be an integer between 60 and 86400');
}

const AI_PROVIDER = optional('AI_PROVIDER', 'ollama');
if (AI_PROVIDER !== 'ollama' && AI_PROVIDER !== 'gemini' && AI_PROVIDER !== 'openrouter') {
  invalid('AI_PROVIDER', 'must be "ollama", "gemini", or "openrouter"');
}

const OLLAMA_BASE_URL = optional('OLLAMA_BASE_URL', 'http://127.0.0.1:11434');
const ollamaBaseUrl = parseUrl('OLLAMA_BASE_URL', OLLAMA_BASE_URL);
if (!['http:', 'https:'].includes(ollamaBaseUrl.protocol)) {
  invalid('OLLAMA_BASE_URL', 'must be an HTTP or HTTPS URL');
}

const OLLAMA_MODEL = optional('OLLAMA_MODEL', 'llama3.1');

const GEMINI_API_KEY = AI_PROVIDER === 'gemini' ? required('GEMINI_API_KEY') : optional('GEMINI_API_KEY', '');
const GEMINI_BASE_URL = optional('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com');
const geminiBaseUrl = parseUrl('GEMINI_BASE_URL', GEMINI_BASE_URL);
if (!['http:', 'https:'].includes(geminiBaseUrl.protocol)) {
  invalid('GEMINI_BASE_URL', 'must be an HTTP or HTTPS URL');
}
const GEMINI_MODEL = optional('GEMINI_MODEL', 'gemini-3.6-flash');

const OPENROUTER_API_KEY = AI_PROVIDER === 'openrouter' ? required('OPENROUTER_API_KEY') : optional('OPENROUTER_API_KEY', '');
const OPENROUTER_BASE_URL = optional('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1');
const openrouterBaseUrl = parseUrl('OPENROUTER_BASE_URL', OPENROUTER_BASE_URL);
if (!['http:', 'https:'].includes(openrouterBaseUrl.protocol)) {
  invalid('OPENROUTER_BASE_URL', 'must be an HTTP or HTTPS URL');
}
const OPENROUTER_MODEL = optional('OPENROUTER_MODEL', 'liquid/lfm-2.5-2.6b:free');

const API_PUBLIC_URL = optional('API_PUBLIC_URL', `http://localhost:${PORT}`);
const apiPublicUrl = parseUrl('API_PUBLIC_URL', API_PUBLIC_URL);
if (!['http:', 'https:'].includes(apiPublicUrl.protocol)) {
  invalid('API_PUBLIC_URL', 'must be an HTTP or HTTPS URL');
}

const env = Object.freeze({
  NODE_ENV, PORT, DATABASE_URL, CLIENT_URL: clientUrl.origin,
  JWT_SECRET, JWT_EXPIRES_IN_SECONDS,
  AI_PROVIDER, OLLAMA_BASE_URL: ollamaBaseUrl.origin, OLLAMA_MODEL,
  GEMINI_API_KEY, GEMINI_BASE_URL: geminiBaseUrl.origin, GEMINI_MODEL,
  OPENROUTER_API_KEY, OPENROUTER_BASE_URL: OPENROUTER_BASE_URL.replace(/\/+$/, ''), OPENROUTER_MODEL,
  API_PUBLIC_URL: apiPublicUrl.origin,
});

export default env;
