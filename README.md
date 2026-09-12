# Butta Health backend

A small TypeScript + Node.js ESM Express REST API foundation for Butta Health. The only endpoint
is a public liveness check. Authentication and health data models are not implemented.

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
must be a single HTTP(S) origin. All four values are validated at startup.
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
CORS allows the configured client origin with credentials enabled for future use.
The health endpoint does not query the database.

`npm test` runs bootstrap-only checks using synthetic configuration and no database.
`npm run db:check` separately runs a read-only `SELECT 1` through Prisma against
the configured database. Neither command changes database tables.

## Prisma and layout

- `src/app.ts`: middleware, routes, 404 and final error handling.
- `src/server.ts`: validated startup and bounded graceful shutdown.
- `src/routes/health.routes.ts`: liveness endpoint.
- `prisma/schema.prisma`: PostgreSQL datasource and generator, with no models.
- `prisma.config.ts`: Prisma 7 configuration, using the central environment module.
- `src/scripts/check-db.ts`: separate Prisma connectivity verification.
- `test/bootstrap.test.ts`: HTTP and startup verification.

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

Prisma 7.10 supports generation without models by default. No migration or schema
push is needed. The first migration belongs
to the approved core-model feature.

## Git

The primary branch is `main`.
The private repository is [Cybug-dev/butta-health-backend](https://github.com/Cybug-dev/butta-health-backend),
connected locally as `origin`.
Review the files and `git status` before explicitly approving a commit.

Next boundary after approval: **Core User/Auth data model + native email/password authentication.**
