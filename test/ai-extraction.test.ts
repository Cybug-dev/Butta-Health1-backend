import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { Server } from 'node:http';
import { before, after, beforeEach, test } from 'node:test';
import { parse } from 'dotenv';
import { parseSetCookie } from 'cookie';

const fileEnv = parse(fs.readFileSync(new URL('../.env', import.meta.url)));
const testDatabase = process.env.TEST_DATABASE_URL || fileEnv.TEST_DATABASE_URL;
assert.ok(testDatabase, 'Set TEST_DATABASE_URL to an isolated, migrated test database.');
const applicationDatabase = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
assert.ok(applicationDatabase, 'Application DATABASE_URL is needed to check test isolation.');

function databaseIdentity(value: string) {
  const url = new URL(value);
  return `${url.hostname.replace('-pooler', '')}${url.pathname}`;
}

assert.notEqual(databaseIdentity(testDatabase), databaseIdentity(applicationDatabase),
  'Integration tests must not use the application database.');

Object.assign(process.env, {
  NODE_ENV: 'test', PORT: '5000', DATABASE_URL: testDatabase,
  CLIENT_URL: 'http://localhost:5173', JWT_SECRET: randomBytes(32).toString('hex'),
  JWT_EXPIRES_IN_SECONDS: '3600', AI_PROVIDER: 'ollama',
  OLLAMA_BASE_URL: 'http://127.0.0.1:65535', OLLAMA_MODEL: 'test-model',
});

const { default: app } = await import('../src/app.js');
const { prisma } = await import('../src/config/database.js');
const runId = randomUUID();
const ownedEmails = [`ai-extraction-${runId}@example.test`];
let server: Server;
let base: string;
let ownerCookie: string;
let ownerId: string;

const realFetch = global.fetch;
const OLLAMA_ORIGIN = 'http://127.0.0.1:65535';
let ollamaFetchImpl: typeof fetch = realFetch;
global.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(OLLAMA_ORIGIN)) return ollamaFetchImpl(input, init);
  return realFetch(input, init);
}) as typeof fetch;

function ollamaJsonResponse(body: unknown) {
  ollamaFetchImpl = (async () => new Response(JSON.stringify({ response: JSON.stringify(body) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
}

function ollamaUnreachable() {
  ollamaFetchImpl = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
}

async function register(email: string) {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      firstName: 'Extraction', lastName: 'Tester', email, password: 'An extraction test passphrase!',
    }),
  });
  assert.equal(response.status, 201);
  const payload = await response.json() as { data: { user: { id: string } } };
  const header = response.headers.get('set-cookie');
  assert.ok(header);
  const cookie = parseSetCookie(header);
  return { cookie: `${cookie.name}=${cookie.value}`, id: payload.data.user.id };
}

function post(path: string, cookie: string | undefined, body: unknown, origin = 'http://localhost:5173') {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

function get(path: string, cookie?: string) {
  return fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
}

before(async () => {
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: process.env, encoding: 'utf8', windowsHide: true, timeout: 60_000,
  });
  assert.equal(migration.status, 0, 'Could not apply migrations to the isolated test database.');
  await prisma.$connect();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
  const owner = await register(ownedEmails[0]!);
  ownerCookie = owner.cookie;
  ownerId = owner.id;
});

beforeEach(() => {
  ollamaFetchImpl = realFetch;
});

after(async () => {
  global.fetch = realFetch;
  try {
    await prisma.user.deleteMany({ where: { email: { in: ownedEmails } } });
  } finally {
    if (server) {
      const closed = once(server, 'close');
      server.close();
      server.closeAllConnections();
      await closed;
    }
    await prisma.$disconnect();
  }
});

test('extraction requires authentication', async () => {
  const response = await post('/api/health-events/extract', undefined, { observation: 'Headache', source: 'Typed' });
  assert.equal(response.status, 401);
});

test('extraction is refused without consent, and unblocked once consent is granted', async () => {
  const denied = await post('/api/health-events/extract', ownerCookie, { observation: 'Headache since last night.', source: 'Typed' });
  assert.equal(denied.status, 403);
  assert.deepEqual((await denied.json() as { error: { code: string } }).error.code, 'AI_CONSENT_REQUIRED');

  const consent = await fetch(`${base}/api/ai-consent`, {
    method: 'PUT',
    headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ granted: true }),
  });
  assert.equal(consent.status, 200);

  ollamaJsonResponse({
    type: 'SYMPTOM', title: 'Headache observation', severity: 'Mild',
    symptoms: ['Head pain'], treatment: '',
  });

  const allowed = await post('/api/health-events/extract', ownerCookie, { observation: 'Headache since last night.', source: 'Typed' });
  assert.equal(allowed.status, 200);
  const body = await allowed.json() as { data: { draft: { type: string; notes: string }; safety: { urgent: boolean } } };
  assert.equal(body.data.draft.type, 'SYMPTOM');
  assert.equal(body.data.draft.notes, 'Headache since last night.');
  assert.equal(body.data.safety.urgent, false);
});

test('curated urgent phrases are flagged regardless of model output', async () => {
  ollamaJsonResponse({
    type: 'SYMPTOM', title: 'Chest discomfort', severity: 'Mild',
    symptoms: ['Chest pain'], treatment: '',
    educationalContext: ['Chest discomfort is commonly discussed in relation to exertion and stress.'],
  });

  const response = await post('/api/health-events/extract', ownerCookie, {
    observation: 'I have chest pain and shortness of breath right now.', source: 'Typed',
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    data: { draft: { severity: string }; educationalContext: string[]; safety: { urgent: boolean; advisory: string | null } };
  };
  assert.equal(body.data.draft.severity, 'Severe');
  assert.equal(body.data.safety.urgent, true);
  assert.ok(body.data.safety.advisory);
  assert.deepEqual(body.data.educationalContext, []);
});

test('general educational bullets pass through for non-urgent extractions', async () => {
  ollamaJsonResponse({
    type: 'SYMPTOM', title: 'Headache observation', severity: 'Mild',
    symptoms: ['Head pain'], treatment: '',
    educationalContext: [
      'Tension headaches are commonly associated with stress, dehydration, and poor sleep.',
      'Staying hydrated and maintaining a regular sleep schedule is often discussed as a general supportive measure.',
    ],
  });

  const response = await post('/api/health-events/extract', ownerCookie, {
    observation: 'Headache since this morning.', source: 'Typed',
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { educationalContext: string[] } };
  assert.equal(body.data.educationalContext.length, 2);
});

test('diagnostic-sounding bullets are stripped from educational context', async () => {
  ollamaJsonResponse({
    type: 'SYMPTOM', title: 'Headache observation', severity: 'Mild',
    symptoms: ['Head pain'], treatment: '',
    educationalContext: [
      'You have a tension headache and should take 400mg ibuprofen.',
      'Headaches are commonly associated with dehydration and stress.',
    ],
  });

  const response = await post('/api/health-events/extract', ownerCookie, {
    observation: 'Headache since this morning.', source: 'Typed',
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { educationalContext: string[] } };
  assert.deepEqual(body.data.educationalContext, ['Headaches are commonly associated with dehydration and stress.']);
});

test('structured symptom tags are always merged into the draft, independent of model output', async () => {
  ollamaJsonResponse({
    type: 'SYMPTOM', title: 'Headache observation', severity: 'Mild',
    symptoms: ['Head pain'], treatment: '',
  });

  const response = await post('/api/health-events/extract', ownerCookie, {
    observation: 'Headache again today.', source: 'Typed',
    symptomTags: ['Headaches / head pain', 'Sleep disruption', 'Head pain'],
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { draft: { symptoms: string[] } } };
  assert.deepEqual(body.data.draft.symptoms, ['Headaches / head pain', 'Sleep disruption', 'Head pain']);
});

test('a model refusal returns 422 without creating a health event', async () => {
  ollamaJsonResponse({ refuse: true, reason: 'unrelated to health' });

  const response = await post('/api/health-events/extract', ownerCookie, { observation: 'What is the weather today?', source: 'Typed' });
  assert.equal(response.status, 422);
  assert.deepEqual((await response.json() as { error: { code: string } }).error.code, 'AI_EXTRACTION_REFUSED');
});

test('provider unavailability returns 503 and preserves the raw text client-side', async () => {
  ollamaUnreachable();
  const response = await post('/api/health-events/extract', ownerCookie, { observation: 'Headache again today.', source: 'Typed' });
  assert.equal(response.status, 503);
  assert.deepEqual((await response.json() as { error: { code: string } }).error.code, 'AI_PROVIDER_UNAVAILABLE');
});

test('extraction requires the configured origin and JSON content', async () => {
  const wrongOrigin = await post('/api/health-events/extract', ownerCookie, { observation: 'Headache.', source: 'Typed' }, 'https://evil.example');
  assert.equal(wrongOrigin.status, 403);

  const noJson = await fetch(`${base}/api/health-events/extract`, {
    method: 'POST', headers: { Cookie: ownerCookie, Origin: 'http://localhost:5173' }, body: 'not-json',
  });
  assert.equal(noJson.status, 415);
});

test('every extraction attempt is recorded for audit without storing the full raw note', async () => {
  ollamaJsonResponse({ type: 'SYMPTOM', title: 'Test', severity: 'Mild', symptoms: [], treatment: '' });
  const longObservation = `Longitudinal note. ${'x'.repeat(500)}`;
  await post('/api/health-events/extract', ownerCookie, { observation: longObservation, source: 'Typed' });

  const extractions = await prisma.aiExtraction.findMany({ where: { userId: ownerId } });
  assert.ok(extractions.length > 0);
  for (const extraction of extractions) {
    assert.ok(extraction.inputPreview.length <= 200);
  }
});
