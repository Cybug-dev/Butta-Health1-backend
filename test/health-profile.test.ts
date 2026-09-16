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
const ownedEmails = [`profile-${runId}@example.test`, `other-${runId}@example.test`];
let server: Server;
let base: string;
let ownerCookie: string;
let otherCookie: string;

function ownedProfileCount() {
  return prisma.healthProfile.count({ where: { user: { email: { in: ownedEmails } } } });
}

type ProfileResponse = {
  success: true;
  data: { profile: {
    dateOfBirth: string | null;
    sex: string | null;
    allergies: string[];
    existingConditions: string[];
    [key: string]: unknown;
  } };
};

async function register(email: string) {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      firstName: 'Profile', lastName: 'Tester', email, password: 'A profile test passphrase!',
    }),
  });
  assert.equal(response.status, 201);
  const header = response.headers.get('set-cookie');
  assert.ok(header);
  const cookie = parseSetCookie(header);
  return `${cookie.name}=${cookie.value}`;
}

function profileRequest(method: 'GET' | 'PUT', cookie?: string, body?: unknown,
  origin = 'http://localhost:5173') {
  return fetch(`${base}/api/health-profile`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method === 'PUT' ? { 'Content-Type': 'application/json', Origin: origin } : {}),
    },
    ...(method === 'PUT' ? { body: JSON.stringify(body) } : {}),
  });
}

const completeProfile = {
  dateOfBirth: '1995-08-17',
  sex: 'Female',
  bloodGroup: 'O+',
  allergies: [' Penicillin ', 'Dust', 'Dust'],
  existingConditions: ['Asthma'],
  currentMedications: [],
  emergencyContactName: 'Grace Tester',
  emergencyContactPhone: '+234 801 234 5678',
};

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

test('health-profile routes require authentication', async () => {
  for (const response of [
    await profileRequest('GET'),
    await profileRequest('PUT', undefined, completeProfile),
  ]) {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
  }
});

test('a missing own profile returns the safe 404 contract', async () => {
  const response = await profileRequest('GET', ownerCookie);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: { code: 'HEALTH_PROFILE_NOT_FOUND', message: 'Health profile not found.' },
  });
});

test('profile writes require the configured origin and JSON content', async () => {
  const wrongOrigin = await profileRequest('PUT', ownerCookie, completeProfile, 'https://evil.example');
  assert.equal(wrongOrigin.status, 403);
  const noJson = await fetch(`${base}/api/health-profile`, {
    method: 'PUT', headers: { Cookie: ownerCookie, Origin: 'http://localhost:5173' }, body: 'not-json',
  });
  assert.equal(noJson.status, 415);
  assert.equal(await ownedProfileCount(), 0);
});

test('invalid or client-owned identity fields cannot create a profile', async () => {
  for (const body of [
    {},
    { ...completeProfile, userId: randomUUID() },
    { ...completeProfile, dateOfBirth: '2999-01-01' },
    { ...completeProfile, bloodGroup: 'unknown' },
    { ...completeProfile, allergies: [''] },
    { ...completeProfile, emergencyContactPhone: 'not-a-phone' },
  ]) {
    const response = await profileRequest('PUT', ownerCookie, body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide a valid health profile.' },
    });
  }
  assert.equal(await ownedProfileCount(), 0);
});

test('a user can create and fetch one normalized health profile', async () => {
  const put = await profileRequest('PUT', ownerCookie, completeProfile);
  assert.equal(put.status, 200);
  assert.equal(put.headers.get('cache-control'), 'no-store');
  const putBody = await put.json() as ProfileResponse;
  assert.equal(putBody.success, true);
  assert.equal(putBody.data.profile.dateOfBirth, '1995-08-17');
  assert.deepEqual(putBody.data.profile.allergies, ['Penicillin', 'Dust']);
  assert.equal('userId' in putBody.data.profile, false);
  assert.deepEqual(Object.keys(putBody.data.profile).sort(), [
    'id', 'dateOfBirth', 'sex', 'bloodGroup', 'allergies', 'existingConditions',
    'currentMedications', 'emergencyContactName', 'emergencyContactPhone', 'createdAt', 'updatedAt',
  ].sort());

  const get = await profileRequest('GET', ownerCookie);
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await get.json(), putBody);
});

test('PUT replaces the same profile instead of creating a duplicate', async () => {
  const previous = await (await profileRequest('GET', ownerCookie)).json() as ProfileResponse;
  const replacement = {
    dateOfBirth: null,
    sex: null,
    bloodGroup: 'A-',
    allergies: [],
    existingConditions: ['Hypertension'],
    currentMedications: ['Medication A'],
    emergencyContactName: null,
    emergencyContactPhone: null,
  };
  const response = await profileRequest('PUT', ownerCookie, replacement);
  assert.equal(response.status, 200);
  const body = await response.json() as ProfileResponse;
  assert.equal(body.data.profile.id, previous.data.profile.id);
  assert.equal(body.data.profile.dateOfBirth, null);
  assert.equal(body.data.profile.sex, null);
  assert.deepEqual(body.data.profile.existingConditions, ['Hypertension']);
  assert.equal(await ownedProfileCount(), 1);
});

test('each authenticated user is isolated to their own profile', async () => {
  const missing = await profileRequest('GET', otherCookie);
  assert.equal(missing.status, 404);
  const response = await profileRequest('PUT', otherCookie, {
    ...completeProfile, allergies: ['Latex'], existingConditions: [], currentMedications: [],
  });
  assert.equal(response.status, 200);
  const owner = await profileRequest('GET', ownerCookie);
  const other = await profileRequest('GET', otherCookie);
  assert.deepEqual(((await owner.json()) as ProfileResponse).data.profile.existingConditions, ['Hypertension']);
  assert.deepEqual(((await other.json()) as ProfileResponse).data.profile.allergies, ['Latex']);
  assert.equal(await ownedProfileCount(), 2);
});

test('body and query identities cannot read or overwrite another user profile', async () => {
  const otherUser = await prisma.user.findUniqueOrThrow({ where: { email: ownedEmails[1] } });
  const beforeOther = await (await profileRequest('GET', otherCookie)).json();
  const beforeOwner = await (await profileRequest('GET', ownerCookie)).json();
  const queryUrl = `${base}/api/health-profile?userId=${otherUser.id}`;
  const read = await fetch(queryUrl, { headers: { Cookie: ownerCookie } });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), beforeOwner);
  const rejected = await profileRequest('PUT', ownerCookie, { ...completeProfile, userId: otherUser.id });
  assert.equal(rejected.status, 400);
  const write = await fetch(queryUrl, {
    method: 'PUT',
    headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ ...completeProfile, allergies: ['Owner only'] }),
  });
  assert.equal(write.status, 200);
  assert.deepEqual(await (await profileRequest('GET', otherCookie)).json(), beforeOther);
  const owner = await (await profileRequest('GET', ownerCookie)).json() as ProfileResponse;
  assert.deepEqual(owner.data.profile.allergies, ['Owner only']);
  assert.equal(await ownedProfileCount(), 2);
});
