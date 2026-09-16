import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { Server } from 'node:http';
import { before, beforeEach, after, test } from 'node:test';
import { parse } from 'dotenv';
import { parseSetCookie } from 'cookie';
import { SignJWT, decodeJwt } from 'jose';
import { verify, needsRehash } from 'argon2';
import { z } from 'zod';

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

const testSecret = randomBytes(32).toString('hex');
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: '5000', DATABASE_URL: testDatabase,
  CLIENT_URL: 'http://localhost:5173', JWT_SECRET: testSecret, JWT_EXPIRES_IN_SECONDS: '3600',
});

const { default: app } = await import('../src/app.js');
const { prisma } = await import('../src/config/database.js');
const { registerLimiter, loginLimiter } = await import('../src/middleware/auth-security.middleware.js');
const { authCookieName } = await import('../src/auth/cookie.js');
const { Prisma } = await import('../src/generated/prisma/client.js');
const runId = randomUUID();
const email = `auth-${runId}@example.test`;
const password = 'A long test-only passphrase!';
const registration = { firstName: ' Ada ', lastName: ' Lovelace ', email, password };
let server: Server;
let base: string;
let userId: string;
let authCookie: string;

const safeResponse = z.strictObject({
  success: z.literal(true),
  data: z.strictObject({ user: z.strictObject({
    id: z.uuid(), email: z.email(), firstName: z.string(), lastName: z.string(),
    createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  }) }),
});

function cookieHeader(response: Response) {
  const header = response.headers.get('set-cookie');
  assert.ok(header, 'Expected an auth cookie.');
  const cookie = parseSetCookie(header);
  assert.equal(cookie.name, authCookieName);
  assert.ok(cookie.value);
  return `${cookie.name}=${cookie.value}`;
}

function post(route: string, body: unknown, cookie?: string, origin = 'http://localhost:5173') {
  return fetch(`${base}/api/auth/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function me(cookie?: string) {
  return fetch(`${base}/api/auth/me`, { headers: cookie ? { Cookie: cookie } : {} });
}

before(async () => {
  await prisma.$connect();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  // Exercise real production quotas independently in each test, without disabling them.
  await registerLimiter.resetKey('127.0.0.1');
  await loginLimiter.resetKey('127.0.0.1');
});

after(async () => {
  try {
    // Only this run's synthetic users; account rows cascade with their users.
    await prisma.user.deleteMany({ where: { email: { contains: runId, mode: 'insensitive' } } });
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

test('register creates a normalized user and only an Argon2id credential atomically', async () => {
  const response = await post('register', { ...registration, email: ` ${email.toUpperCase()} ` });
  assert.equal(response.status, 201);
  const body = safeResponse.parse(await response.json());
  userId = body.data.user.id;
  assert.equal(body.data.user.email, email);
  assert.equal(body.data.user.firstName, 'Ada');
  assert.equal(body.data.user.lastName, 'Lovelace');
  authCookie = cookieHeader(response);
  const account = await prisma.authAccount.findUniqueOrThrow({ where: { userId_provider: { userId, provider: 'LOCAL' } } });
  assert.equal(account.providerAccountId, null);
  assert.ok(account.passwordHash);
  assert.ok(account.passwordHash.startsWith('$argon2id$'));
  assert.equal(needsRehash(account.passwordHash, { memoryCost: 19456, timeCost: 2, parallelism: 1 }), false);
  assert.ok(account.passwordHash !== password);
  assert.ok(await verify(account.passwordHash, password));
});

test('cookie is HTTP-only and JWT contains only identity and required standard claims', async () => {
  const response = await post('login', { email, password });
  assert.equal(response.status, 200);
  const header = response.headers.get('set-cookie');
  assert.ok(header);
  const cookie = parseSetCookie(header);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, undefined);
  assert.equal(cookie.sameSite, 'lax');
  assert.equal(cookie.path, '/');
  assert.equal(cookie.domain, undefined);
  assert.equal(cookie.maxAge, 3600);
  assert.ok(cookie.value);
  const payload = decodeJwt(cookie.value);
  assert.deepEqual(Object.keys(payload).sort(), ['aud', 'exp', 'iat', 'iss', 'sub']);
  assert.equal(payload.sub, userId);
  assert.ok(payload.exp && payload.iat);
  assert.equal(payload.exp - payload.iat, 3600);
  safeResponse.parse(await response.json());
});

test('duplicate normalized email returns a safe conflict with no new cookie or account', async () => {
  const response = await post('register', { ...registration, email: ` ${email.toUpperCase()} ` });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    success: false, error: { code: 'REGISTRATION_CONFLICT', message: 'Unable to register with these details.' },
  });
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(await prisma.user.count({ where: { email } }), 1);
  assert.equal(await prisma.authAccount.count({ where: { userId } }), 1);
});

test('concurrent registration cannot create duplicate users or orphan accounts', async () => {
  const raceEmail = `race-${runId}@example.test`;
  const responses = await Promise.all([post('register', { ...registration, email: raceEmail }),
    post('register', { ...registration, email: raceEmail.toUpperCase() })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: raceEmail }, include: { authAccounts: true } });
  assert.equal(user.authAccounts.length, 1);
});

test('invalid registration payloads are rejected before any user is created', async () => {
  const invalidEmail = `invalid-${runId}@example.test`;
  const valid = { ...registration, email: invalidEmail };
  for (const body of [
    {}, [], null, { ...valid, firstName: '' }, { ...valid, lastName: '  ' },
    { ...valid, firstName: 'a'.repeat(101) }, { ...valid, email: 'invalid' },
    { ...valid, password: 'short' }, { ...valid, password: 'a'.repeat(129) },
    { ...valid, password: 12345 }, { ...valid, provider: 'GOOGLE' },
  ]) {
    await registerLimiter.resetKey('127.0.0.1');
    const response = await post('register', body);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal(await prisma.user.count({ where: { email: invalidEmail } }), 0);
});

test('normalized login succeeds and wrong/unknown credentials have equivalent generic 401 responses', async () => {
  const good = await post('login', { email: ` ${email.toUpperCase()} `, password });
  assert.equal(good.status, 200);
  safeResponse.parse(await good.json());
  const wrong = await post('login', { email, password: 'Another long wrong password' });
  const unknown = await post('login', { email: `unknown-${runId}@example.test`, password });
  for (const response of [wrong, unknown]) {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
    });
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('me returns safe current user fields, rejects no cookie, and ignores bearer headers', async () => {
  const response = await me(authCookie);
  assert.equal(response.status, 200);
  assert.equal(safeResponse.parse(await response.json()).data.user.id, userId);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await me()).status, 401);
  const bearer = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${authCookie.split('=')[1]}` } });
  assert.equal(bearer.status, 401);
});

test('invalid, tampered, expired, wrong-algorithm and missing-claim JWTs are rejected', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = authCookie.slice(authCookie.indexOf('=') + 1);
  const parts = token.split('.');
  assert.ok(parts[2]);
  parts[2] = (parts[2].startsWith('A') ? 'B' : 'A') + parts[2].slice(1);
  const claims = { sub: userId, iss: 'butta-health', aud: 'butta-health-client', iat: now, exp: now + 3600 };
  const key = Buffer.from(testSecret, 'hex');
  const expired = await new SignJWT({ ...claims, iat: now - 7200, exp: now - 3600 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
  const wrongAlgorithm = await new SignJWT(claims).setProtectedHeader({ alg: 'HS384', typ: 'JWT' }).sign(key);
  const missingExpiry = await new SignJWT({ sub: userId, iss: claims.iss, aud: claims.aud, iat: now })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
  const missingUser = await new SignJWT({ ...claims, sub: randomUUID() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
  const invalidSubject = await new SignJWT({ ...claims, sub: 'not-a-uuid' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
  for (const value of ['invalid', parts.join('.'), expired, wrongAlgorithm, missingExpiry, missingUser, invalidSubject]) {
    const response = await me(`${authCookieName}=${value}`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
  }
});

test('logout expires the cookie using matching attributes and is idempotent', async () => {
  const response = await post('logout', {}, authCookie);
  assert.equal(response.status, 200);
  const header = response.headers.get('set-cookie');
  assert.ok(header);
  const cleared = parseSetCookie(header);
  assert.equal(cleared.name, authCookieName);
  assert.equal(cleared.value, '');
  assert.equal(cleared.path, '/');
  assert.equal(cleared.httpOnly, true);
  assert.equal(cleared.sameSite, 'lax');
  assert.equal(cleared.secure, undefined);
  assert.ok(cleared.expires && cleared.expires.getTime() < Date.now());
  assert.equal((await me(`${cleared.name}=${cleared.value}`)).status, 401);
  assert.equal((await post('logout', {})).status, 200);
  const empty = await fetch(`${base}/api/auth/logout`, {
    method: 'POST', headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(empty.status, 200);
});

test('auth writes reject hostile origins, form content and malformed JSON', async () => {
  assert.equal((await post('login', { email, password }, undefined, 'https://hostile.example')).status, 403);
  const form = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'logout=1',
  });
  assert.equal(form.status, 415);
  const malformed = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"private-password":',
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    success: false, error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' },
  });
});

test('production cookie uses Secure and the host-only prefix', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    "const c = await import('./src/auth/cookie.ts'); console.log(JSON.stringify({name:c.authCookieName,options:c.authCookieOptions}));"], {
    env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    name: '__Host-butta_auth', options: { httpOnly: true, secure: true, sameSite: 'none', path: '/' },
  });
});

test('provider constraints allow LOCAL plus a future GOOGLE identity on one user, never duplicate identities', async () => {
  const providerAccountId = `google-test-${runId}`;
  await prisma.authAccount.create({ data: { userId, provider: 'GOOGLE', providerAccountId } });
  assert.equal(await prisma.user.count({ where: { id: userId } }), 1);
  assert.equal(await prisma.authAccount.count({ where: { userId } }), 2);
  const other = await prisma.user.findUniqueOrThrow({ where: { email: `race-${runId}@example.test` } });
  await assert.rejects(prisma.authAccount.create({ data: { userId: other.id, provider: 'GOOGLE', providerAccountId } }),
    (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');
  const local = await prisma.authAccount.findUniqueOrThrow({ where: { userId_provider: { userId, provider: 'LOCAL' } } });
  await assert.rejects(prisma.authAccount.create({ data: { userId, provider: 'LOCAL', passwordHash: local.passwordHash } }),
    (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');
});

test('failed nested account creation leaves no user row behind', async () => {
  const atomicEmail = `atomic-${runId}@example.test`;
  const local = await prisma.authAccount.findUniqueOrThrow({ where: { userId_provider: { userId, provider: 'LOCAL' } } });
  await assert.rejects(prisma.user.create({ data: {
    email: atomicEmail, firstName: 'Test', lastName: 'Atomic',
    authAccounts: { create: [
      { provider: 'LOCAL', passwordHash: local.passwordHash },
      { provider: 'LOCAL', passwordHash: local.passwordHash },
    ] },
  } }), (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');
  assert.equal(await prisma.user.count({ where: { email: atomicEmail } }), 0);
});

test('database CHECK constraints reject unnormalized emails and invalid provider credentials', async () => {
  // The PostgreSQL adapter reports CHECK violations with SQLSTATE 23514.
  const checkFailure = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError
    && error.message.includes('23514');
  await assert.rejects(prisma.user.create({ data: {
    email: `UPPER-${runId}@example.test`, firstName: 'Test', lastName: 'Constraint',
  } }), checkFailure);
  const other = await prisma.user.findUniqueOrThrow({ where: { email: `race-${runId}@example.test` } });
  await assert.rejects(prisma.authAccount.create({ data: {
    userId: other.id, provider: 'GOOGLE', providerAccountId: null,
  } }), checkFailure);
  await assert.rejects(prisma.authAccount.update({
    where: { userId_provider: { userId, provider: 'LOCAL' } }, data: { passwordHash: 'not-a-hash' },
  }), checkFailure);
  assert.equal(await prisma.user.count({ where: { email: `UPPER-${runId}@example.test` } }), 0);
});

test('register and login enforce their independent attempt limits with a safe 429 response', async () => {
  for (const [route, limit] of [['register', 5], ['login', 10]] as const) {
    for (let i = 0; i < limit; i++) assert.equal((await post(route, {})).status, 400);
    const limited = await post(route, {});
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('retry-after'));
    assert.deepEqual(await limited.json(), {
      success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again later.' },
    });
  }
});

test('the previous public health endpoint still works without authentication', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: { status: 'ok' } });
});
