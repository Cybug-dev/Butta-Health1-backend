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
const ownedEmails = [`milestone-two-${runId}@example.test`, `milestone-two-other-${runId}@example.test`];
let server: Server;
let base: string;
let ownerCookie: string;
let otherCookie: string;

async function register(email: string) {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      firstName: 'Dashboard', lastName: 'Tester', email, password: 'A milestone two passphrase!',
    }),
  });
  assert.equal(response.status, 201);
  const header = response.headers.get('set-cookie');
  assert.ok(header);
  const cookie = parseSetCookie(header);
  return `${cookie.name}=${cookie.value}`;
}

function get(path: string, cookie?: string) {
  return fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
}

function write(method: 'POST' | 'PUT', path: string, cookie: string | undefined, body: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
    },
    body: JSON.stringify(body),
  });
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

test('milestone-two routes require authentication', async () => {
  for (const response of [
    await get('/api/dashboard?timezone=Africa%2FLagos'),
    await get('/api/check-ins/today?timezone=Africa%2FLagos'),
    await get('/api/check-ins/history'),
    await get('/api/notification-preferences'),
  ]) {
    assert.equal(response.status, 401);
  }
});

test('dashboard returns owner-scoped aggregates and timezone-aware activity', async () => {
  const eventDate = new Date(Date.now() - 60_000).toISOString();
  const create = await write('POST', '/api/health-events', ownerCookie, {
    type: 'SYMPTOM', title: 'Recent headache', eventDate, severity: 'Mild',
    symptoms: ['Head pain'], treatment: 'Rested', notes: 'A short headache.', source: 'Typed',
  });
  assert.equal(create.status, 201);
  await write('POST', '/api/health-events', otherCookie, {
    type: 'SYMPTOM', title: 'Other private event', eventDate, severity: 'Mild',
    symptoms: ['Private'], treatment: '', notes: 'Must remain private.', source: 'Typed',
  });

  const response = await get('/api/dashboard?timezone=Africa%2FLagos', ownerCookie);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = await response.json() as { data: { dashboard: {
    totalEvents: number; eventsThisMonth: number; profileCompletion: number;
    latestEvent: { title: string }; recentEvents: Array<{ title: string }>;
    activity: Array<{ count: number }>; timezone: string;
  } } };
  assert.equal(payload.data.dashboard.totalEvents, 1);
  assert.equal(payload.data.dashboard.eventsThisMonth, 1);
  assert.equal(payload.data.dashboard.profileCompletion, 27);
  assert.equal(payload.data.dashboard.latestEvent.title, 'Recent headache');
  assert.deepEqual(payload.data.dashboard.recentEvents.map((event) => event.title), ['Recent headache']);
  assert.equal(payload.data.dashboard.activity.length, 7);
  assert.equal(payload.data.dashboard.activity.reduce((sum, day) => sum + day.count, 0), 1);
  assert.equal(payload.data.dashboard.timezone, 'Africa/Lagos');
});

test('today check-in is stable and its deterministic prompt uses recent event context', async () => {
  const first = await get('/api/check-ins/today?timezone=Africa%2FLagos', ownerCookie);
  const second = await get('/api/check-ins/today?timezone=Africa%2FLagos', ownerCookie);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const firstBody = await first.json() as { data: { checkIn: { id: string; promptType: string; promptText: string; respondedAt: null } } };
  const secondBody = await second.json() as typeof firstBody;
  assert.equal(firstBody.data.checkIn.id, secondBody.data.checkIn.id);
  assert.equal(firstBody.data.checkIn.promptType, 'SYMPTOM_FOLLOW_UP');
  assert.ok(firstBody.data.checkIn.promptText.includes('Recent headache'));
});

test('answering a check-in atomically creates one confirmed event and rejects repeats', async () => {
  const today = await (await get('/api/check-ins/today?timezone=Africa%2FLagos', ownerCookie)).json() as {
    data: { checkIn: { id: string } };
  };
  const response = await write('POST', `/api/check-ins/${today.data.checkIn.id}/respond`, ownerCookie, {
    notes: 'The headache has eased after resting.', severity: 'Mild', symptoms: ['Head pain'],
  });
  assert.equal(response.status, 201);
  const payload = await response.json() as { data: { checkIn: { respondedAt: string; healthEventId: string }; healthEvent: { type: string; status: string; notes: string } } };
  assert.ok(payload.data.checkIn.respondedAt);
  assert.equal(payload.data.healthEvent.type, 'CHECK_IN');
  assert.equal(payload.data.healthEvent.status, 'Confirmed');
  assert.equal(payload.data.healthEvent.notes, 'The headache has eased after resting.');

  const duplicate = await write('POST', `/api/check-ins/${today.data.checkIn.id}/respond`, ownerCookie, {
    notes: 'Duplicate response',
  });
  assert.equal(duplicate.status, 409);
  assert.equal(await prisma.healthEvent.count({ where: { id: payload.data.checkIn.healthEventId } }), 1);

  const foreign = await write('POST', `/api/check-ins/${today.data.checkIn.id}/respond`, otherCookie, {
    notes: 'Attempted foreign response',
  });
  assert.equal(foreign.status, 404);

  const checkInEventId = payload.data.checkIn.healthEventId;
  const retype = await fetch(`${base}/api/health-events/${checkInEventId}`, {
    method: 'PATCH',
    headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ type: 'SYMPTOM' }),
  });
  assert.equal(retype.status, 409);

  const remove = await fetch(`${base}/api/health-events/${checkInEventId}`, {
    method: 'DELETE', headers: { Cookie: ownerCookie, Origin: 'http://localhost:5173' },
  });
  assert.equal(remove.status, 200);
  const reopened = await (await get('/api/check-ins/today?timezone=Africa%2FLagos', ownerCookie)).json() as {
    data: { checkIn: { id: string; respondedAt: string | null; healthEventId: string | null } };
  };
  assert.equal(reopened.data.checkIn.id, today.data.checkIn.id);
  assert.equal(reopened.data.checkIn.respondedAt, null);
  assert.equal(reopened.data.checkIn.healthEventId, null);
});

test('notification preferences have defaults and persist only for their owner', async () => {
  const defaults = await get('/api/notification-preferences', ownerCookie);
  assert.equal(defaults.status, 200);
  const defaultsBody = await defaults.json() as { data: { preferences: { eventReminders: boolean; timezone: string } } };
  assert.equal(defaultsBody.data.preferences.eventReminders, true);
  assert.equal(defaultsBody.data.preferences.timezone, 'UTC');

  const update = await write('PUT', '/api/notification-preferences', ownerCookie, {
    eventReminders: false,
    weeklySummary: true,
    dailyCheckIn: true,
    checkInTime: '08:30',
    timezone: 'Africa/Lagos',
  });
  assert.equal(update.status, 200);

  const owner = await (await get('/api/notification-preferences', ownerCookie)).json() as {
    data: { preferences: { eventReminders: boolean; checkInTime: string; timezone: string } };
  };
  const other = await (await get('/api/notification-preferences', otherCookie)).json() as typeof owner;
  assert.equal(owner.data.preferences.eventReminders, false);
  assert.equal(owner.data.preferences.checkInTime, '08:30');
  assert.equal(owner.data.preferences.timezone, 'Africa/Lagos');
  assert.equal(other.data.preferences.eventReminders, true);
  assert.equal(other.data.preferences.timezone, 'UTC');
});
