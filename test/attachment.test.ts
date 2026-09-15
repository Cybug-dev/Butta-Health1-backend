import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
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
const ownedEmails = [`attachment-${runId}@example.test`, `attachment-other-${runId}@example.test`];
let server: Server;
let base: string;
let ownerCookie: string;
let otherCookie: string;

const completeEvent = {
  type: 'SYMPTOM',
  title: 'Rash observation',
  eventDate: new Date().toISOString(),
  severity: 'Mild',
  symptoms: ['Skin rash'],
  treatment: '',
  notes: 'A photo of a rash on my arm.',
  source: 'Typed',
};

async function register(email: string) {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      firstName: 'Attachment', lastName: 'Tester', email, password: 'An attachment test passphrase!',
    }),
  });
  assert.equal(response.status, 201);
  const header = response.headers.get('set-cookie');
  assert.ok(header);
  const cookie = parseSetCookie(header);
  return `${cookie.name}=${cookie.value}`;
}

function tinyPngBlob() {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  return new Blob([Buffer.from(base64, 'base64')], { type: 'image/png' });
}

async function uploadAttachment(cookie: string | undefined, origin = 'http://localhost:5173') {
  const form = new FormData();
  form.append('files', tinyPngBlob(), 'rash.png');
  return fetch(`${base}/api/attachments`, {
    method: 'POST',
    headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin },
    body: form,
  });
}

async function createEvent(cookie: string) {
  const response = await fetch(`${base}/api/health-events`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify(completeEvent),
  });
  assert.equal(response.status, 201);
  const payload = await response.json() as { data: { healthEvent: { id: string } } };
  return payload.data.healthEvent.id;
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
  const cookies = await Promise.all(ownedEmails.map(register));
  assert.ok(cookies[0] && cookies[1]);
  ownerCookie = cookies[0];
  otherCookie = cookies[1];
});

after(async () => {
  try {
    const users = await prisma.user.findMany({ where: { email: { in: ownedEmails } }, select: { id: true } });
    const attachments = await prisma.healthEventAttachment.findMany({
      where: { userId: { in: users.map((user) => user.id) } },
      select: { storageKey: true },
    });
    await prisma.user.deleteMany({ where: { email: { in: ownedEmails } } });
    const { deleteAttachmentFiles } = await import('../src/services/attachment-file-cleanup.service.js');
    await deleteAttachmentFiles(attachments.map((attachment) => attachment.storageKey));
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

test('uploading requires authentication and the configured origin', async () => {
  const noAuth = await uploadAttachment(undefined);
  assert.equal(noAuth.status, 401);

  const wrongOrigin = await uploadAttachment(ownerCookie, 'https://evil.example');
  assert.equal(wrongOrigin.status, 403);
});

test('a valid image upload returns a pending attachment with an authenticated URL', async () => {
  const response = await uploadAttachment(ownerCookie);
  assert.equal(response.status, 201);
  const body = await response.json() as { data: { attachments: Array<{ id: string; status: string; url: string; mimeType: string }> } };
  assert.equal(body.data.attachments.length, 1);
  assert.equal(body.data.attachments[0]!.status, 'PENDING');
  assert.equal(body.data.attachments[0]!.mimeType, 'image/png');
  assert.ok(body.data.attachments[0]!.url.includes(body.data.attachments[0]!.id));
});

test('an uploaded file can be downloaded only by its owner', async () => {
  const upload = await uploadAttachment(ownerCookie);
  const body = await upload.json() as { data: { attachments: Array<{ id: string }> } };
  const attachmentId = body.data.attachments[0]!.id;

  const ownerDownload = await fetch(`${base}/api/attachments/${attachmentId}/file`, { headers: { Cookie: ownerCookie } });
  assert.equal(ownerDownload.status, 200);
  assert.equal(ownerDownload.headers.get('content-type'), 'image/png');

  const otherDownload = await fetch(`${base}/api/attachments/${attachmentId}/file`, { headers: { Cookie: otherCookie } });
  assert.equal(otherDownload.status, 404);

  const noAuthDownload = await fetch(`${base}/api/attachments/${attachmentId}/file`);
  assert.equal(noAuthDownload.status, 401);
});

test('attaching links pending attachments to an owned event and rejects reuse or cross-owner attachments', async () => {
  const eventId = await createEvent(ownerCookie);
  const upload = await uploadAttachment(ownerCookie);
  const uploadBody = await upload.json() as { data: { attachments: Array<{ id: string }> } };
  const attachmentId = uploadBody.data.attachments[0]!.id;

  const attachResponse = await fetch(`${base}/api/health-events/${eventId}/attachments`, {
    method: 'POST',
    headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ attachmentIds: [attachmentId] }),
  });
  assert.equal(attachResponse.status, 200);
  const attachBody = await attachResponse.json() as { data: { attachments: Array<{ id: string; status: string }> } };
  assert.equal(attachBody.data.attachments.length, 1);
  assert.equal(attachBody.data.attachments[0]!.status, 'ATTACHED');

  const reuseResponse = await fetch(`${base}/api/health-events/${eventId}/attachments`, {
    method: 'POST',
    headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ attachmentIds: [attachmentId] }),
  });
  assert.equal(reuseResponse.status, 400);

  const otherEventAttempt = await fetch(`${base}/api/health-events/${eventId}/attachments`, {
    method: 'POST',
    headers: { Cookie: otherCookie, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ attachmentIds: [randomUUID()] }),
  });
  assert.equal(otherEventAttempt.status, 404);
});

test('uploads reject non-image files', async () => {
  const form = new FormData();
  form.append('files', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'notes.txt');
  const response = await fetch(`${base}/api/attachments`, {
    method: 'POST',
    headers: { Cookie: ownerCookie, Origin: 'http://localhost:5173' },
    body: form,
  });
  assert.equal(response.status, 415);
});
