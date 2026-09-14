import assert from 'node:assert/strict';
import { once } from 'node:events';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import type { Server } from 'node:http';

// Synthetic configuration keeps these HTTP checks independent of Neon access.
const testEnv = {
  NODE_ENV: 'production',
  PORT: '5000',
  DATABASE_URL: 'postgresql://test:bootstrap-secret@localhost:5432/test',
  CLIENT_URL: 'http://localhost:5173',
  JWT_SECRET: 'a'.repeat(64),
  JWT_EXPIRES_IN_SECONDS: '3600',
};
Object.assign(process.env, testEnv);

const { default: app } = await import('../src/app.js');
const root = path.resolve(import.meta.dirname, '..');
let server: Server;
let baseUrl: string;

function serverPort() {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return address.port;
}

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${serverPort()}`;
});

after(async () => {
  const closed = once(server, 'close');
  server.close();
  server.closeAllConnections();
  await closed;
});

test('health returns the exact public contract and security headers', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: { status: 'ok' } });
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('unknown routes return the agreed 404 error envelope', async () => {
  const response = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  });
});

test('Swagger documentation and local assets are public with security headers intact', async () => {
  const response = await fetch(`${baseUrl}/api-docs/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('swagger-ui'));
  assert.ok(response.headers.get('content-security-policy')?.includes("script-src 'self'"));
  for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-init.js']) {
    const assetResponse = await fetch(`${baseUrl}/api-docs/${asset}`);
    assert.equal(assetResponse.status, 200);
    assert.ok((await assetResponse.text()).length > 0);
  }
  const specResponse = await fetch(`${baseUrl}/api-docs/openapi.json`);
  assert.equal(specResponse.status, 200);
  const spec = await specResponse.json() as {
    openapi: string;
    paths: Record<string, Record<string, unknown>>;
    components: { securitySchemes: { cookieAuth: { in: string; name: string } } };
  };
  assert.equal(spec.openapi, '3.0.3');
  assert.deepEqual(Object.entries(spec.paths).flatMap(([route, methods]) =>
    Object.keys(methods).map(method => `${method.toUpperCase()} ${route}`)).sort(), [
    'GET /api/health', 'POST /api/auth/register', 'POST /api/auth/login',
    'POST /api/auth/logout', 'GET /api/auth/me', 'GET /api/health-profile', 'PUT /api/health-profile',
  ].sort());
  assert.deepEqual({ in: spec.components.securitySchemes.cookieAuth.in, name: spec.components.securitySchemes.cookieAuth.name },
    { in: 'cookie', name: '__Host-butta_auth' });
  assert.ok(!JSON.stringify(spec).includes(testEnv.JWT_SECRET));
});

test('CORS permits only the configured origin, including credentialed preflight', async () => {
  const allowed = await fetch(`${baseUrl}/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: testEnv.CLIENT_URL, 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), testEnv.CLIENT_URL);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');

  for (const origin of ['https://untrusted.example', 'http://localhost:5173.evil.example', 'null']) {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
  }
});

test('invalid JSON and oversized bodies produce safe client errors', async () => {
  for (const [body, status, code, message] of [
    ['{"private-health-input":', 400, 'INVALID_JSON', 'Request body must contain valid JSON.'],
    [JSON.stringify({ value: 'a'.repeat(103_000) }), 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'],
  ] as const) {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    assert.equal(response.status, status);
    const result = await response.json();
    assert.deepEqual(result, { success: false, error: { code, message } });
    assert.ok(!JSON.stringify(result).includes('private-health-input'));
  }
});

function startWith(overrides: Record<string, string>) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: root,
    env: { ...process.env, ...testEnv, ...overrides },
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  });
}

test('missing required variables fail startup without exposing secret values', () => {
  for (const name of Object.keys(testEnv)) {
    const result = startWith({ [name]: '' });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`${name} is required`));
    assert.ok(!result.stderr.includes('bootstrap-secret'));
    assert.equal(result.stdout, '');
  }
});

test('invalid configuration fails startup with safe variable-specific errors', () => {
  for (const [name, value] of [
    ['PORT', '0'], ['PORT', '65536'], ['PORT', '5e3'], ['PORT', '5000abc'],
    ['NODE_ENV', 'invalid'], ['DATABASE_URL', 'invalid-bootstrap-secret'],
    ['DATABASE_URL', 'https://localhost/test'], ['CLIENT_URL', '*'],
    ['CLIENT_URL', 'http://user:bootstrap-secret@localhost:5173'],
    ['CLIENT_URL', 'http://localhost:5173/path'],
    ['JWT_SECRET', 'short'], ['JWT_SECRET', 'z'.repeat(64)],
    ['JWT_EXPIRES_IN_SECONDS', '0'], ['JWT_EXPIRES_IN_SECONDS', '86401'],
    ['JWT_EXPIRES_IN_SECONDS', '1e3'],
  ] as const) {
    const result = startWith({ [name]: value });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`Invalid configuration: ${name}`));
    assert.ok(!result.stderr.includes('bootstrap-secret'));
  }
});

test('an occupied port fails startup cleanly', () => {
  const result = startWith({ PORT: String(serverPort()) });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('PORT is already in use'));
  assert.ok(!result.stderr.includes('bootstrap-secret'));
});
