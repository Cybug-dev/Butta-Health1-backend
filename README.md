# Butta Health backend

A TypeScript + Node.js ESM Express API with native email/password authentication,
a private health profile, and a public liveness check. Google OAuth and health
event history are not implemented.

## Prerequisites

- Node.js 24 LTS, version 24.21.0 or newer within the 24.x line, and npm.
- Access to the existing Neon project `butta-health`.
- Git; GitHub CLI is needed only to manage the private remote.

## Local setup

From this project directory:

```powershell
npm ci
Copy-Item .env.example .env # First setup only; do not overwrite an existing .env.
```

Edit `.env` locally. Set `DATABASE_URL` to the PostgreSQL connection string from
the existing Neon project's Connect dialog. Use `sslmode=verify-full` to explicitly
verify the server certificate and hostname; retain other connection parameters.
Keep `NODE_ENV=development`, `PORT=5000`, and
`CLIENT_URL=http://localhost:5173` unless your local setup differs. `CLIENT_URL`
must be a single HTTP(S) origin. Set `JWT_SECRET` to a cryptographically random
32-byte key encoded as 64 hexadecimal characters and `JWT_EXPIRES_IN_SECONDS=3600`.
The allowed lifetime is 60–86400 seconds. Bootstrap has already generated a local
key in ignored `.env`; use a different secret for each environment.
All required values are validated at startup without printing secrets.
Existing process environment variables take precedence over `.env`.

Never share or commit `.env`. `.env.example` intentionally leaves the database
value blank. Runtime configuration is centralized in `src/config/env.ts`.

On the Windows machine used for bootstrap, a separate Node 24 runtime is installed
without replacing the machine's existing Node installation. To use it in PowerShell:

```powershell
$env:PATH = "$env:LOCALAPPDATA\ButtaHealthTools\node-v24.21.0-win-x64;$env:PATH"
node --version
```

## Run and verify

```powershell
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate
npm run typecheck
npm run db:check
npm test
npm run dev
```

`npm run dev` runs TypeScript with the `tsx` watcher. For production execution:

```powershell
npm run build
npm start
```

The build compiles `src/` into ignored `dist/` using strict TypeScript and
NodeNext module resolution. `npm start` runs `dist/server.js` directly with Node.
Relative imports use `.js` extensions so they resolve after compilation.
`npm run typecheck` checks source, tests, and Prisma configuration without emitting files.

Open
`http://localhost:5000/api/health` or run:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

The HTTP 200 response is:

```json
{ "success": true, "data": { "status": "ok" } }
```

Failures use `{ "success": false, "error": { "code": "...", "message": "..." } }`.
Unknown routes return 404; error responses never include raw exceptions or input.
CORS allows the configured client origin with credentials enabled.
The health endpoint does not query the database.

`npm test` runs bootstrap, auth, and health-profile integration checks.
`npm run test:bootstrap` runs the database-free checks alone. `npm run test:auth`
and `npm run test:profile` run their respective integration suites.
Set `TEST_DATABASE_URL` in ignored `.env` to a separate disposable Neon branch;
`auth-foundation-test` was created for this purpose. The integration suite rejects
the application database, applies Prisma migrations to the test database, and
removes only its own randomly named fixtures afterward. Never point it at real data.
`npm run db:check` separately runs a read-only `SELECT 1` through Prisma against
the configured application database.

## Authentication

Send JSON bodies and use `credentials: 'include'` in browser fetch requests:

- `POST /api/auth/register`: `firstName`, `lastName`, `email`, `password`; returns 201.
- `POST /api/auth/login`: `email`, `password`; returns 200.
- `GET /api/auth/me`: returns the current user or 401.
- `POST /api/auth/logout`: no body required; returns 200 and expires the auth cookie.

Register, login and me return `{ "success": true, "data": { "user": ... } }`.
The user contains only `id`, `email`, `firstName`, `lastName`, `createdAt`, and
`updatedAt`. Tokens and credential records are never returned in JSON.

Names are trimmed (1–100 characters), emails are trimmed/lowercased, and passwords
are preserved exactly (15–128 characters for registration). Unknown fields and
malformed payloads are rejected. Passwords use Argon2id with 19 MiB memory,
two iterations, one lane and unique random salts, following the
[OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Wrong passwords and unknown emails share the same 401 response and both perform
Argon2 verification. Duplicate registration returns a generic 409 conflict;
the differing registration status still permits some account enumeration.

JWTs use HS256 with verified issuer/audience, subject UUID and required issued-at/
expiry claims. Identity claims contain only the user ID, never email or health data.
The HTTP-only, host-only cookie uses `SameSite=Lax`, `Path=/`, and a lifetime matching
the JWT. It is named `butta_auth` locally and `__Host-butta_auth` with `Secure` in
production. Production requires HTTPS and a same-site client/API arrangement.
Browser auth writes must originate from `CLIENT_URL`; JSON-only credential submissions and
SameSite cookies provide additional CSRF protection. Auth responses use `no-store`.

Registration permits 5 attempts per IP per 15 minutes; login permits 10. Limits
are in memory for this single-process foundation. Proxy trust remains disabled;
configure the known proxy topology and a shared limiter store before scaling out.

Logout clears the browser cookie. A copied JWT remains valid until expiry;
server-side revocation, refresh tokens, password reset and email verification
are outside this boundary. No tokens are stored in localStorage or accepted from
Authorization headers.

## Health profile

Both profile routes require the JWT cookie and derive the owner only from the
authenticated request. Browser requests must use `credentials: 'include'`.

- `GET /api/health-profile`: returns the current user's profile or a safe 404.
- `PUT /api/health-profile`: creates or fully replaces the current user's profile.

`PUT` requires JSON with `allergies`, `existingConditions`, and
`currentMedications` arrays. It accepts nullable `dateOfBirth`, `sex`,
`bloodGroup`, `emergencyContactName`, and `emergencyContactPhone`. Dates use
`YYYY-MM-DD`; blood groups use `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, or
`O-`. Unknown fields are rejected. List entries are trimmed, empty entries are
rejected, and duplicates are removed while preserving order. Responses use
`{ "success": true, "data": { "profile": ... } }` and `Cache-Control: no-store`.

## Prisma and layout

- `src/app.ts`: middleware, routes, 404 and final error handling.
- `src/server.ts`: validated startup and bounded graceful shutdown.
- `src/routes/health.routes.ts`: liveness endpoint.
- `prisma/schema.prisma`: User/AuthAccount/HealthProfile models and ESM client generator.
- `prisma.config.ts`: Prisma 7 configuration, using the central environment module.
- `src/scripts/check-db.ts`: separate Prisma connectivity verification.
- `test/bootstrap.test.ts`: HTTP and startup verification.
- `src/auth/`, `src/controllers/`, `src/middleware/`, `src/schemas/`, `src/services/`:
  token/cookie/password handling, typed authentication, validation and auth operations.
- `test/auth.test.ts`: integration and security checks on the isolated database.
- `test/health-profile.test.ts`: profile validation, ownership, upsert, and privacy checks.

Prisma CLI and Client are pinned to matching stable versions. The current
`prisma-client` generator uses `moduleFormat = "esm"` and writes TypeScript to
ignored `src/generated/prisma/`. Run `npm run prisma:generate` after installation
or schema changes, before typechecking or building. The client compiles alongside
the application into `dist/generated/prisma/`; no separate Prisma compilation step
is needed. `npm run db:check` uses the source client through `tsx`. After a build,
`node dist/scripts/check-db.js` verifies the compiled ESM client with the same
read-only query. The PostgreSQL adapter is required by Prisma 7.

Two scoped dependency overrides pin patched versions of Prisma CLI dependencies:
`deepmerge-ts` 8.0.2 and `mysql2` 3.24.4. They address upstream
[recursive-merge](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) and
[MySQL compression](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) advisories.
The deepmerge major update changes Map merging, which this plain-object Prisma
configuration does not use. Revisit these overrides when upgrading Prisma;
rerun validation, generation, and the connectivity check. MySQL is a transitive
CLI dependency, not an application database.

`npm run prisma:migrate` applies checked-in migrations. Prisma CLI configuration
uses the direct Neon endpoint while application queries retain connection pooling.
The first migration creates only `User` and `AuthAccount`, with UUID IDs and UTC
timestamps. Unique indexes enforce normalized email, one provider account per
user, and globally unique provider identities. The user/provider composite index
also supports user relation lookups; there is no redundant userId index.

Migration CHECK constraints enforce normalized email and provider credential
shape: LOCAL requires an Argon2id hash and no provider account ID; GOOGLE requires
a provider account ID and no password hash. These CHECK constraints are maintained
in migration SQL because Prisma does not model them. Registration uses one nested
transaction for both rows, and deleting a user cascades to its auth accounts.
The GOOGLE enum value reserves the schema for future linking; no OAuth flow or
automatic email-based account linking is implemented.

The health-profile migration adds one optional profile per user. A unique
`userId` enforces that ownership in the database, and deletion of a user cascades
to the profile. Birth dates use PostgreSQL `DATE`; health lists use non-null text
arrays; and the database also constrains stored blood-group values.

## Git

The primary branch is `main`.
The private repository is [Cybug-dev/butta-health-backend](https://github.com/Cybug-dev/butta-health-backend),
connected locally as `origin`.
Review the files and `git status` before explicitly approving a commit.

No further product features are included in this change.
