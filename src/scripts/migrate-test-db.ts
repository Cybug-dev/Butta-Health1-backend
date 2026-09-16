import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';

// Runs the Prisma migrations against the isolated integration test database once,
// before the test files execute. Each test file used to run its own `migrate deploy`
// in a before() hook, but Node's test runner does not fully serialize separate test
// files against an external resource: overlapping migrate-deploy calls raced against
// the same Neon test branch and intermittently failed. Migrating once up front removes
// the race entirely.
const fileEnv = parse(fs.readFileSync(new URL('../../.env', import.meta.url)));
const testDatabase = process.env.TEST_DATABASE_URL || fileEnv.TEST_DATABASE_URL;
if (!testDatabase) {
  console.error('Set TEST_DATABASE_URL to an isolated, migrated test database.');
  process.exit(1);
}

const applicationDatabase = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
function databaseIdentity(value: string) {
  const url = new URL(value);
  return `${url.hostname.replace('-pooler', '')}${url.pathname}`;
}
if (applicationDatabase && databaseIdentity(testDatabase) === databaseIdentity(applicationDatabase)) {
  console.error('Integration tests must not use the application database.');
  process.exit(1);
}

const migration = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  { env: { ...process.env, DATABASE_URL: testDatabase }, encoding: 'utf8', windowsHide: true, timeout: 60_000, stdio: 'inherit' },
);

if (migration.status !== 0) {
  console.error('Could not apply migrations to the isolated test database.');
  process.exit(migration.status ?? 1);
}
