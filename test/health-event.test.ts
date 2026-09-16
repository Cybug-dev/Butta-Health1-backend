import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import type { Server } from 'node:http';
import { before, after, test } from 'node:test';
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
  JWT_EXPIRES_IN_SECONDS: '3600',
});

const { default: app } = await import('../src/app.js');
const { prisma } = await import('../src/config/database.js');
const runId = randomUUID();
const ownedEmails = [`events-${runId}@example.test`, `events-other-${runId}@example.test`];
let server: Server;
let base: string;
let ownerCookie: string;
let otherCookie: string;
let ownerEventId: string;

type HealthEvent = {
  id: string;
  type: 'SYMPTOM' | 'MEDICATION' | 'DIGESTIVE' | 'DOCTOR_VISIT';
  title: string;
  eventDate: string;
  severity: 'Mild' | 'Moderate' | 'Severe' | 'Not specified';
  symptoms: string[];
  treatment: string;
  notes: string;
  source: 'Typed' | 'Voice' | 'Preset';
  status: 'Confirmed' | 'Needs monitoring' | 'Prepared';
  createdAt: string;
  updatedAt: string;
};

type EventResponse = { success: true; data: { healthEvent: HealthEvent } };
type EventListResponse = { success: true; data: { events: HealthEvent[]; nextCursor: string | null } };

const completeEvent = {
  type: 'SYMPTOM',
  title: ' Morning headache ',
  eventDate: '2026-09-14T08:15:00.000Z',
  severity: 'Moderate',
  symptoms: [' Head pain ', 'Head pain', 'Light sensitivity'],
  treatment: ' Rested and drank water. ',
  notes: 'Headache began shortly after waking.',
  source: 'Typed',
};

async function register(email: string) {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      firstName: 'Event', lastName: 'Tester', email, password: 'An event test passphrase!',
    }),
  });
  assert.equal(response.status, 201);
  const header = response.headers.get('set-cookie');
  assert.ok(header);
  const cookie = parseSetCookie(header);
  return `${cookie.name}=${cookie.value}`;
}

function eventRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path = '',
  cookie?: string,
  body?: unknown,
  origin = 'http://localhost:5173',
) {
  const writesJson = method === 'POST' || method === 'PATCH';
  return fetch(`${base}/api/health-events${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(writesJson ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { Origin: origin } : {}),
    },
    ...(writesJson ? { body: JSON.stringify(body) } : {}),
  });
}

async function createEvent(cookie: string, overrides: Record<string, unknown> = {}) {
  const response = await eventRequest('POST', '', cookie, { ...completeEvent, ...overrides });
  assert.equal(response.status, 201);
  return (await response.json() as EventResponse).data.healthEvent;
}

before(async () => {
  await prisma.$connect();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
  const cookies = await Promise.all(ownedEmails.map(register));
  assert.ok(cookies[0] && cookies[1]);
  ownerCookie = cookies[0];
  otherCookie = cookies[1];
});

after(async () => {
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

test('health-event routes require authentication', async () => {
  for (const response of [
    await eventRequest('GET'),
    await eventRequest('POST', '', undefined, completeEvent),
    await eventRequest('GET', `/${randomUUID()}`),
    await eventRequest('PATCH', `/${randomUUID()}`, undefined, { severity: 'Mild' }),
    await eventRequest('DELETE', `/${randomUUID()}`),
  ]) {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
  }
});

test('health-event writes require the configured origin and JSON content', async () => {
  const wrongOrigin = await eventRequest('POST', '', ownerCookie, completeEvent, 'https://evil.example');
  assert.equal(wrongOrigin.status, 403);

  const noJson = await fetch(`${base}/api/health-events`, {
    method: 'POST', headers: { Cookie: ownerCookie, Origin: 'http://localhost:5173' }, body: 'not-json',
  });
  assert.equal(noJson.status, 415);

  const wrongDeleteOrigin = await eventRequest('DELETE', `/${randomUUID()}`, ownerCookie, undefined, 'https://evil.example');
  assert.equal(wrongDeleteOrigin.status, 403);
});

test('invalid and client-owned identity fields cannot create events', async () => {
  for (const body of [
    {},
    { ...completeEvent, userId: randomUUID() },
    { ...completeEvent, id: randomUUID() },
    { ...completeEvent, eventDate: 'not-a-date' },
    { ...completeEvent, title: '' },
    { ...completeEvent, source: 'Imported' },
  ]) {
    const response = await eventRequest('POST', '', ownerCookie, body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide a valid health event.' },
    });
  }
});

test('a user can create and fetch a normalized event without leaking its owner ID', async () => {
  const response = await eventRequest('POST', '', ownerCookie, completeEvent);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json() as EventResponse;
  const event = body.data.healthEvent;
  ownerEventId = event.id;
  assert.equal(event.title, 'Morning headache');
  assert.deepEqual(event.symptoms, ['Head pain', 'Light sensitivity']);
  assert.equal(event.treatment, 'Rested and drank water.');
  assert.equal(event.status, 'Confirmed');
  assert.equal('userId' in event, false);

  const get = await eventRequest('GET', `/${ownerEventId}`, ownerCookie);
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await get.json(), body);
});

test('authenticated users cannot read, update, delete, or paginate from another user event', async () => {
  const read = await eventRequest('GET', `/${ownerEventId}`, otherCookie);
  const update = await eventRequest('PATCH', `/${ownerEventId}`, otherCookie, { severity: 'Severe' });
  const remove = await eventRequest('DELETE', `/${ownerEventId}`, otherCookie);
  for (const response of [read, update, remove]) {
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      success: false, error: { code: 'HEALTH_EVENT_NOT_FOUND', message: 'Health event not found.' },
    });
  }

  const foreignCursor = await eventRequest('GET', `?cursor=${ownerEventId}`, otherCookie);
  assert.equal(foreignCursor.status, 400);
  assert.deepEqual(await foreignCursor.json(), {
    success: false, error: { code: 'INVALID_CURSOR', message: 'Pagination cursor is invalid.' },
  });
});

test('an owner can update allowed fields but cannot inject identity fields', async () => {
  const rejected = await eventRequest('PATCH', `/${ownerEventId}`, ownerCookie, { userId: randomUUID() });
  assert.equal(rejected.status, 400);

  const response = await eventRequest('PATCH', `/${ownerEventId}`, ownerCookie, {
    severity: 'Severe', status: 'Needs monitoring', notes: 'Symptoms became more intense.',
  });
  assert.equal(response.status, 200);
  const event = (await response.json() as EventResponse).data.healthEvent;
  assert.equal(event.severity, 'Severe');
  assert.equal(event.status, 'Needs monitoring');
  assert.equal(event.notes, 'Symptoms became more intense.');
});

test('event listing supports owner-scoped filters, search, date ranges, and cursor pagination', async () => {
  await createEvent(ownerCookie, {
    type: 'MEDICATION', title: 'Acetaminophen taken', eventDate: '2026-09-13T10:05:00.000Z',
    severity: 'Not specified', symptoms: ['Medication event'], notes: 'Took one tablet.',
  });
  await createEvent(ownerCookie, {
    type: 'DIGESTIVE', title: 'Digestive change', eventDate: '2026-09-12T12:40:00.000Z',
    severity: 'Mild', symptoms: ['Digestive change'], notes: 'Noticed a change after lunch.',
  });
  await createEvent(otherCookie, { title: 'Other user private event' });

  const firstPage = await eventRequest('GET', '?limit=2', ownerCookie);
  assert.equal(firstPage.status, 200);
  const firstPageBody = await firstPage.json() as EventListResponse;
  assert.equal(firstPageBody.data.events.length, 2);
  assert.ok(firstPageBody.data.nextCursor);
  assert.ok(firstPageBody.data.events.every((event) => event.title !== 'Other user private event'));

  const secondPage = await eventRequest('GET', `?limit=2&cursor=${firstPageBody.data.nextCursor}`, ownerCookie);
  assert.equal(secondPage.status, 200);
  const secondPageBody = await secondPage.json() as EventListResponse;
  assert.equal(secondPageBody.data.events.length, 1);
  assert.equal(secondPageBody.data.nextCursor, null);

  const medication = await eventRequest('GET', '?type=MEDICATION&search=acetaminophen', ownerCookie);
  const medicationBody = await medication.json() as EventListResponse;
  assert.equal(medicationBody.data.events.length, 1);
  assert.equal(medicationBody.data.events[0]?.type, 'MEDICATION');

  const range = await eventRequest('GET', '?from=2026-09-13T00%3A00%3A00.000Z&to=2026-09-13T23%3A59%3A59.000Z', ownerCookie);
  const rangeBody = await range.json() as EventListResponse;
  assert.deepEqual(rangeBody.data.events.map((event) => event.title), ['Acetaminophen taken']);

  const identityQuery = await eventRequest('GET', `?userId=${randomUUID()}`, ownerCookie);
  assert.equal(identityQuery.status, 400);
});

test('an owner can delete an event and receives a safe 404 afterward', async () => {
  const remove = await eventRequest('DELETE', `/${ownerEventId}`, ownerCookie);
  assert.equal(remove.status, 200);
  assert.deepEqual(await remove.json(), {
    success: true, data: { message: 'Health event deleted.' },
  });

  const missing = await eventRequest('GET', `/${ownerEventId}`, ownerCookie);
  assert.equal(missing.status, 404);
});
