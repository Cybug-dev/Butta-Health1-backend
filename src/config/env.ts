import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// This resolves to the project root from both src/config and dist/config.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

type VariableName = 'NODE_ENV' | 'PORT' | 'DATABASE_URL' | 'CLIENT_URL';

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

const env = Object.freeze({ NODE_ENV, PORT, DATABASE_URL, CLIENT_URL: clientUrl.origin });

export default env;
